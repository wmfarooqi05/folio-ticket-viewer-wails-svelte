package docs

import (
	"errors"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"
)

func write(t *testing.T, root, rel, text string) {
	t.Helper()
	full := filepath.Join(root, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
}

func newTestService(t *testing.T) (*DocsService, string) {
	t.Helper()
	root := t.TempDir()
	write(t, root, "modules/a/issues/01-x.md", "# One\n")
	write(t, root, "modules/a/issues/02-y.md", "\ufeff---\nstatus: open\n---\n# Two\n")
	write(t, root, "handoffs/h.md", "# H\n")
	write(t, root, "modules/a/notes.txt", "not markdown")
	write(t, root, "modules/node_modules/skip.md", "skipped")
	write(t, root, "other/outside-roots.md", "not under a configured root")
	s := NewService(func() Roots {
		return Roots{Docs: root, Roots: []string{"modules", "handoffs", "patterns"}}
	}, nil)
	return s, root
}

func TestSafeJoinRejectsEscapes(t *testing.T) {
	root := t.TempDir()
	bad := []string{
		"", "../x.md", "a/../../x.md", "..", `..\x.md`, "/etc/x.md", `\x.md`,
		`C:\Windows\x.md`, "C:x.md", "a/b/../../../x.md",
	}
	for _, p := range bad {
		if _, err := SafeJoin(root, p); !errors.Is(err, ErrEscapesRoot) {
			t.Errorf("SafeJoin(%q): want ErrEscapesRoot, got %v", p, err)
		}
	}
	if _, err := SafeJoin(root, "modules/a/issues/01-x.md"); err != nil {
		t.Errorf("good path rejected: %v", err)
	}
}

func TestResolveMarkdownOnlyMd(t *testing.T) {
	root := t.TempDir()
	if _, err := ResolveMarkdown(root, "modules/a/notes.txt"); !errors.Is(err, ErrNotMarkdown) {
		t.Fatalf("want ErrNotMarkdown, got %v", err)
	}
	if _, err := ResolveMarkdown(root, "modules/a/X.MD"); err != nil {
		t.Fatalf("uppercase extension should pass: %v", err)
	}
}

func TestScanFindsOnlyMarkdownUnderRoots(t *testing.T) {
	s, _ := newTestService(t)
	res, err := s.Scan()
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"handoffs/h.md", "modules/a/issues/01-x.md", "modules/a/issues/02-y.md"}
	if !slices.Equal(res.Changed, want) || res.Count != 3 || len(res.Removed) != 0 {
		t.Fatalf("unexpected scan: %+v", res)
	}
}

func TestScanDiffsAgainstDeliveredStamps(t *testing.T) {
	s, root := newTestService(t)
	first, _ := s.Scan()
	if _, err := s.ReadBatch(first.Changed); err != nil {
		t.Fatal(err)
	}
	again, _ := s.Scan()
	if len(again.Changed) != 0 || len(again.Removed) != 0 || again.Count != 3 {
		t.Fatalf("nothing changed, got %+v", again)
	}

	// Edit one file (size changes), delete another, add a third.
	write(t, root, "handoffs/h.md", "# H changed and longer\n")
	if err := os.Remove(filepath.Join(root, "modules/a/issues/01-x.md")); err != nil {
		t.Fatal(err)
	}
	write(t, root, "patterns/p.md", "# P\n")
	res, _ := s.Scan()
	if !slices.Equal(res.Changed, []string{"handoffs/h.md", "patterns/p.md"}) {
		t.Errorf("changed: %v", res.Changed)
	}
	if !slices.Equal(res.Removed, []string{"modules/a/issues/01-x.md"}) {
		t.Errorf("removed: %v", res.Removed)
	}
}

func TestReadBatchAndReadFile(t *testing.T) {
	s, _ := newTestService(t)
	res, err := s.ReadBatch([]string{"modules/a/issues/01-x.md", "modules/a/issues/02-y.md", "modules/a/issues/gone.md"})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Files) != 2 || !slices.Equal(res.Missing, []string{"modules/a/issues/gone.md"}) {
		t.Fatalf("unexpected batch: %+v", res)
	}
	byPath := map[string]SourceFile{}
	for _, f := range res.Files {
		byPath[f.Path] = f
	}
	if f := byPath["modules/a/issues/02-y.md"]; f.Text[:3] != "---" || f.Mtime == 0 {
		t.Errorf("BOM not stripped or mtime missing: %+v", f)
	}
	txt, err := s.ReadFile("modules/a/issues/01-x.md")
	if err != nil || txt != "# One\n" {
		t.Fatalf("ReadFile: %q, %v", txt, err)
	}
}

func TestReadsRefuseEscapesAndNonMarkdown(t *testing.T) {
	s, _ := newTestService(t)
	if _, err := s.ReadFile("../secret.md"); !errors.Is(err, ErrEscapesRoot) {
		t.Errorf("ReadFile escape: %v", err)
	}
	if _, err := s.ReadFile("modules/a/notes.txt"); !errors.Is(err, ErrNotMarkdown) {
		t.Errorf("ReadFile txt: %v", err)
	}
	if _, err := s.ReadBatch([]string{"modules/a/issues/01-x.md", "../secret.md"}); !errors.Is(err, ErrEscapesRoot) {
		t.Errorf("ReadBatch escape: %v", err)
	}
}

// Rescan forgets what was delivered, so a changed root set rebuilds the whole index.
func TestRescanReturnsEveryFile(t *testing.T) {
	s, _ := newTestService(t)
	first, err := s.Scan()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.ReadBatch(first.Changed); err != nil {
		t.Fatal(err)
	}
	if again, _ := s.Scan(); len(again.Changed) != 0 {
		t.Fatalf("a plain Scan after delivery should report nothing: %+v", again)
	}
	res, err := s.Rescan()
	if err != nil {
		t.Fatal(err)
	}
	if res.Count == 0 || len(res.Changed) != res.Count || len(res.Removed) != 0 {
		t.Fatalf("Rescan must list every file as changed: %+v", res)
	}
}

func TestWatcherEmitsDebouncedChangeSet(t *testing.T) {
	root := t.TempDir()
	write(t, root, "modules/a/issues/01-x.md", "# One\n")
	got := make(chan ChangeSet, 8)
	s := NewService(func() Roots { return Roots{Docs: root, Roots: []string{"modules"}} },
		func(cs ChangeSet) { got <- cs })
	t.Cleanup(func() { _ = s.ServiceShutdown() })
	if _, err := s.Scan(); err != nil {
		t.Fatal(err)
	}

	// A new directory with a file, written right away: the race from ticket 01.
	write(t, root, "modules/b/issues/01-new.md", "# New\n")
	select {
	case cs := <-got:
		if !slices.Contains(cs.Changed, "modules/b/issues/01-new.md") {
			t.Fatalf("new file missing from %+v", cs)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("no docs:changed event")
	}
}
