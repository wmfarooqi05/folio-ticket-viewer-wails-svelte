package docs

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"github.com/fsnotify/fsnotify"
)

type watchRig struct {
	s    *DocsService
	root string
	got  chan ChangeSet
}

func newWatchRig(t *testing.T, files ...string) *watchRig {
	t.Helper()
	root := t.TempDir()
	for _, f := range files {
		write(t, root, f, "# "+f+"\n")
	}
	r := &watchRig{root: root, got: make(chan ChangeSet, 32)}
	r.s = NewService(func() Roots { return Roots{Docs: root, Roots: []string{"modules"}} },
		func(cs ChangeSet) { r.got <- cs })
	r.s.setCacheDir(t.TempDir())
	t.Cleanup(func() { _ = r.s.ServiceShutdown() })
	res, err := r.s.Scan()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := r.s.ReadBatch(res.Changed); err != nil {
		t.Fatal(err)
	}
	return r
}

func (r *watchRig) next(t *testing.T, within time.Duration) ChangeSet {
	t.Helper()
	select {
	case cs := <-r.got:
		return cs
	case <-time.After(within):
		t.Fatal("no docs:changed event")
		return ChangeSet{}
	}
}

func (r *watchRig) quiet(t *testing.T, d time.Duration) {
	t.Helper()
	select {
	case cs := <-r.got:
		t.Fatalf("unexpected event %+v", cs)
	case <-time.After(d):
	}
}

// A burst of writes collapses into one ChangeSet after 200 ms of quiet.
func TestDebounceTrailing200ms(t *testing.T) {
	r := newWatchRig(t, "modules/a/01.md")
	start := time.Now()
	for i := 0; i < 3; i++ {
		write(t, r.root, "modules/a/01.md", fmt.Sprintf("# edit %d\n", i+1))
		time.Sleep(50 * time.Millisecond)
	}
	cs := r.next(t, 3*time.Second)
	took := time.Since(start)
	if !slices.Equal(cs.Changed, []string{"modules/a/01.md"}) || len(cs.Removed) != 0 {
		t.Fatalf("unexpected %+v", cs)
	}
	if took < 300*time.Millisecond { // 150 ms of writes + 200 ms quiet, minus slack
		t.Fatalf("flushed too early: %s", took)
	}
	r.quiet(t, 500*time.Millisecond) // one event, no duplicate
}

// Constant activity cannot hold a flush back for more than 1 s.
func TestDebounceMax1s(t *testing.T) {
	r := newWatchRig(t, "modules/a/01.md")
	start := time.Now()
	stop := make(chan struct{})
	done := make(chan struct{})
	go func() {
		defer close(done)
		for i := 0; ; i++ {
			select {
			case <-stop:
				return
			default:
			}
			_ = os.WriteFile(filepath.Join(r.root, "modules/a/01.md"), []byte(fmt.Sprintf("# edit %d\n", i)), 0o644)
			time.Sleep(80 * time.Millisecond)
		}
	}()
	cs := r.next(t, 3*time.Second)
	took := time.Since(start)
	close(stop)
	<-done
	if len(cs.Changed) != 1 {
		t.Fatalf("unexpected %+v", cs)
	}
	if took < 900*time.Millisecond || took > 1600*time.Millisecond {
		t.Fatalf("forced flush should land near 1 s, took %s", took)
	}
}

// A no-op save (same bytes and mtime) is dropped by the stamp check.
func TestUnchangedStampIsDropped(t *testing.T) {
	r := newWatchRig(t, "modules/a/01.md")
	full := filepath.Join(r.root, "modules/a/01.md")
	st, _ := os.Stat(full)
	b, _ := os.ReadFile(full)
	_ = os.WriteFile(full, b, 0o644)
	_ = os.Chtimes(full, st.ModTime(), st.ModTime())
	r.quiet(t, 700*time.Millisecond)
}

func TestFileRenameIsRemovePlusChange(t *testing.T) {
	r := newWatchRig(t, "modules/a/01.md")
	if err := os.Rename(filepath.Join(r.root, "modules/a/01.md"), filepath.Join(r.root, "modules/a/02.md")); err != nil {
		t.Fatal(err)
	}
	cs := r.next(t, 3*time.Second)
	if !slices.Equal(cs.Removed, []string{"modules/a/01.md"}) || !slices.Equal(cs.Changed, []string{"modules/a/02.md"}) {
		t.Fatalf("unexpected %+v", cs)
	}
}

// collect gathers events until both lists have at least the wanted counts.
func (r *watchRig) collect(t *testing.T, wantChanged, wantRemoved int) (changed, removed []string) {
	t.Helper()
	deadline := time.After(4 * time.Second)
	for len(changed) < wantChanged || len(removed) < wantRemoved {
		select {
		case cs := <-r.got:
			changed = append(changed, cs.Changed...)
			removed = append(removed, cs.Removed...)
		case <-deadline:
			t.Fatalf("changed=%v removed=%v", changed, removed)
		}
	}
	slices.Sort(changed)
	slices.Sort(removed)
	return changed, removed
}

func TestDirectoryDeleteRemovesEverythingBeneath(t *testing.T) {
	r := newWatchRig(t, "modules/a/x/01.md", "modules/a/x/deep/02.md", "modules/a/keep.md")
	if err := os.RemoveAll(filepath.Join(r.root, "modules/a/x")); err != nil {
		t.Fatal(err)
	}
	_, removed := r.collect(t, 0, 2)
	if !slices.Equal(removed, []string{"modules/a/x/01.md", "modules/a/x/deep/02.md"}) {
		t.Fatalf("removed = %v", removed)
	}
}

func TestDirectoryRenameAwayAndIn(t *testing.T) {
	r := newWatchRig(t, "modules/a/x/01.md")
	if err := os.Rename(filepath.Join(r.root, "modules/a/x"), filepath.Join(r.root, "modules/a/y")); err != nil {
		t.Fatal(err)
	}
	changed, removed := r.collect(t, 1, 1)
	if !slices.Equal(removed, []string{"modules/a/x/01.md"}) || !slices.Equal(changed, []string{"modules/a/y/01.md"}) {
		t.Fatalf("removed=%v changed=%v", removed, changed)
	}
}

// A directory created with files in it right away (the race from ticket 01) is
// walked, and the directory is watched afterwards.
func TestNewDirectoryIsWalked(t *testing.T) {
	r := newWatchRig(t, "modules/a/01.md")
	write(t, r.root, "modules/new/sub/01.md", "# one\n")
	write(t, r.root, "modules/new/02.md", "# two\n")
	changed, _ := r.collect(t, 2, 0)
	if !slices.Equal(changed, []string{"modules/new/02.md", "modules/new/sub/01.md"}) {
		t.Fatalf("changed=%v", changed)
	}
	if _, err := r.s.ReadBatch(changed); err != nil {
		t.Fatal(err)
	}
	write(t, r.root, "modules/new/sub/01.md", "# one edited\n")
	cs := r.next(t, 3*time.Second)
	if !slices.Equal(cs.Changed, []string{"modules/new/sub/01.md"}) {
		t.Fatalf("%+v", cs)
	}
}

// Only the configured roots, and not _, dot or node_modules folders, are watched.
func TestScopeSkips(t *testing.T) {
	r := newWatchRig(t, "modules/a/01.md")
	for _, d := range []string{"_templates", ".git", "node_modules"} {
		if err := os.MkdirAll(filepath.Join(r.root, "modules", "a", d), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	r.quiet(t, 300*time.Millisecond)
	write(t, r.root, "modules/a/_templates/t.md", "# t\n")
	write(t, r.root, "modules/a/.git/g.md", "# g\n")
	write(t, r.root, "modules/a/node_modules/n.md", "# n\n")
	write(t, r.root, "outside/o.md", "# o\n")
	write(t, r.root, "modules/a/ignored.txt", "x")
	r.quiet(t, 700*time.Millisecond)
	write(t, r.root, "modules/a/02.md", "# real\n")
	cs := r.next(t, 3*time.Second)
	if !slices.Equal(cs.Changed, []string{"modules/a/02.md"}) {
		t.Fatalf("%+v", cs)
	}
	if res, _ := r.s.Scan(); res.Count != 2 {
		t.Fatalf("the walk should skip scoped folders, count=%d", res.Count)
	}
}

// A watcher error (the overflow case) triggers a full diff and a Rescan ChangeSet.
func TestOverflowTriggersRescan(t *testing.T) {
	r := newWatchRig(t, "modules/a/01.md")
	write(t, r.root, "modules/a/new.md", "# new\n")
	if err := os.Remove(filepath.Join(r.root, "modules/a/01.md")); err != nil {
		t.Fatal(err)
	}
	r.s.mu.Lock()
	w := r.s.watch
	r.s.mu.Unlock()
	w.w.Errors <- fsnotify.ErrEventOverflow

	cs := r.next(t, 3*time.Second)
	if !cs.Rescan {
		t.Fatalf("want Rescan: %+v", cs)
	}
	if !slices.Contains(cs.Changed, "modules/a/new.md") || !slices.Contains(cs.Removed, "modules/a/01.md") {
		t.Fatalf("diff missing: %+v", cs)
	}
	// The replacement watcher works.
	if _, err := r.s.ReadBatch(cs.Changed); err != nil {
		t.Fatal(err)
	}
	write(t, r.root, "modules/a/new.md", "# new, edited, longer\n")
	for {
		next := r.next(t, 3*time.Second)
		if slices.Contains(next.Changed, "modules/a/new.md") {
			break
		}
	}
}
