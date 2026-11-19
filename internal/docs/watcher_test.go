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

// A burst of writes collapses into one ChangeSet after 200 ms of quiet, counted from
// the last write. The bounds are loose: only "not before the quiet window" and
// "well before 2 s", so a slow VM does not make this flaky.
func TestDebounceTrailing200ms(t *testing.T) {
	r := newWatchRig(t, "modules/a/01.md")
	for i := 0; i < 3; i++ {
		write(t, r.root, "modules/a/01.md", fmt.Sprintf("# edit %d\n", i+1))
		time.Sleep(40 * time.Millisecond)
	}
	last := time.Now().Add(-40 * time.Millisecond)
	cs := r.next(t, 3*time.Second)
	after := time.Since(last)
	if !slices.Equal(cs.Changed, []string{"modules/a/01.md"}) || len(cs.Removed) != 0 {
		t.Fatalf("unexpected %+v", cs)
	}
	if after < 150*time.Millisecond || after > 2*time.Second {
		t.Fatalf("flush should come about 200 ms after the last write, got %s", after)
	}
	r.quiet(t, 500*time.Millisecond) // one event, no duplicate
}

// Constant activity cannot hold a flush back for more than about 1 s.
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
			time.Sleep(40 * time.Millisecond)
		}
	}()
	cs := r.next(t, 4*time.Second)
	took := time.Since(start)
	close(stop)
	<-done
	if len(cs.Changed) != 1 {
		t.Fatalf("unexpected %+v", cs)
	}
	if took < 700*time.Millisecond || took > 2500*time.Millisecond {
		t.Fatalf("the forced flush should land near 1 s, took %s", took)
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

// responsive fails if the service is wedged: Scan, ReadBatch and shutdown must all return.
func (r *watchRig) responsive(t *testing.T) {
	t.Helper()
	done := make(chan error, 1)
	go func() {
		if _, err := r.s.Scan(); err != nil {
			done <- err
			return
		}
		_, err := r.s.ReadBatch([]string{})
		done <- err
	}()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("service is wedged: Scan or ReadBatch did not return")
	}
}

// Real overflows (a 4 KB buffer, two flooded directories), not an injected error: the
// service must stay responsive, shut down, and report a Rescan.
func TestRealOverflowKeepsServiceResponsive(t *testing.T) {
	old := watchBufferSize
	watchBufferSize = 4096
	t.Cleanup(func() { watchBufferSize = old })
	r := newWatchRig(t, "modules/a/01.md", "modules/b/01.md")
	// Wedge the loop in its flush (it needs s.mu) so it stops draining, as a slow VM
	// would, then flood: fsnotify's reader backs up and the OS buffers overflow.
	write(t, r.root, "modules/a/01.md", "# edited to start a flush")
	time.Sleep(20 * time.Millisecond)
	r.s.mu.Lock()
	time.Sleep(400 * time.Millisecond)
	for _, d := range []string{"a", "b"} {
		for i := 0; i < 1500; i++ {
			_ = os.WriteFile(filepath.Join(r.root, "modules", d, fmt.Sprintf("a-rather-long-file-name-%05d.md", i)), []byte("x"), 0o644)
		}
	}
	r.s.mu.Unlock()
	sawRescan := false
	deadline := time.After(15 * time.Second)
	for !sawRescan {
		select {
		case cs := <-r.got:
			sawRescan = cs.Rescan
		case <-deadline:
			t.Fatal("no Rescan ChangeSet after a real overflow")
		}
	}
	r.responsive(t)
	done := make(chan struct{})
	go func() { _ = r.s.ServiceShutdown(); close(done) }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("ServiceShutdown hung")
	}
}

// A new directory plus a burst of other events (a git checkout): the loop must keep
// draining while the new directory is registered, so nothing deadlocks.
func TestNewDirectoryAmidstAnEventBurst(t *testing.T) {
	r := newWatchRig(t, "modules/a/01.md")
	write(t, r.root, "modules/new/n.md", "# n\n")
	for i := 0; i < 120; i++ {
		_ = os.WriteFile(filepath.Join(r.root, "modules", "a", fmt.Sprintf("f%03d.md", i)), []byte("x"), 0o644)
	}
	seen := map[string]bool{}
	deadline := time.After(10 * time.Second)
	for len(seen) < 121 {
		select {
		case cs := <-r.got:
			for _, p := range cs.Changed {
				seen[p] = true
			}
		case <-deadline:
			t.Fatalf("saw %d of 121 paths: the watcher stalled", len(seen))
		}
	}
	if !seen["modules/new/n.md"] {
		t.Fatal("the new directory's file was missed")
	}
}

// Nothing is emitted after ServiceShutdown.
func TestNoEmitAfterShutdown(t *testing.T) {
	r := newWatchRig(t, "modules/a/01.md")
	_ = r.s.ServiceShutdown()
	write(t, r.root, "modules/a/01.md", "# changed after shutdown\n")
	r.quiet(t, 600*time.Millisecond)
}

// A failed rescan after an error is retried instead of leaving no watcher.
func TestRescanAfterErrorRetries(t *testing.T) {
	old := rescanBackoff
	rescanBackoff = []time.Duration{20 * time.Millisecond, 20 * time.Millisecond, 20 * time.Millisecond}
	t.Cleanup(func() { rescanBackoff = old })
	r := newWatchRig(t, "modules/a/01.md")
	docs := ""
	calls := 0
	r.s.roots = func() Roots { // the root is "missing" for the first two attempts
		calls++
		if calls < 4 {
			return Roots{Docs: docs, Roots: []string{"modules"}}
		}
		return Roots{Docs: r.root, Roots: []string{"modules"}}
	}
	r.s.mu.Lock()
	w := r.s.watch
	r.s.mu.Unlock()
	w.w.Errors <- fsnotify.ErrEventOverflow
	cs := r.next(t, 5*time.Second)
	if !cs.Rescan {
		t.Fatalf("want a Rescan after the retries: %+v", cs)
	}
}

// One unreadable file is a soft failure: the others still come back, and the
// announced stamp is cleared so a retry sees the file again.
func TestReadBatchFailureIsSoft(t *testing.T) {
	r := newWatchRig(t, "modules/a/01.md", "modules/a/02.md")
	if err := os.MkdirAll(filepath.Join(r.root, "modules/a/dir.md"), 0o755); err != nil { // reads fail on a directory
		t.Fatal(err)
	}
	r.s.mu.Lock()
	r.s.announced["modules/a/dir.md"] = stamp{Mtime: 1, Size: 1}
	r.s.mu.Unlock()
	res, err := r.s.ReadBatch([]string{"modules/a/01.md", "modules/a/dir.md", "modules/a/02.md"})
	if err != nil {
		t.Fatalf("a bad file must not fail the batch: %v", err)
	}
	if len(res.Files) != 2 || !slices.Equal(res.Failed, []string{"modules/a/dir.md"}) {
		t.Fatalf("files=%d failed=%v", len(res.Files), res.Failed)
	}
	r.s.mu.Lock()
	_, still := r.s.announced["modules/a/dir.md"]
	r.s.mu.Unlock()
	if still {
		t.Fatal("announced stamp should be cleared for a failed read")
	}
}

// Scan forgets announced stamps of files that are gone.
func TestScanClearsAnnouncedOfRemovedFiles(t *testing.T) {
	r := newWatchRig(t, "modules/a/01.md")
	r.s.mu.Lock()
	r.s.announced["modules/a/ghost.md"] = stamp{Mtime: 1, Size: 1}
	r.s.mu.Unlock()
	if _, err := r.s.Scan(); err != nil {
		t.Fatal(err)
	}
	r.s.mu.Lock()
	n := len(r.s.announced)
	r.s.mu.Unlock()
	if n != 0 {
		t.Fatalf("announced = %d", n)
	}
}
