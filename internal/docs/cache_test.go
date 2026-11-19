package docs

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func cacheService(t *testing.T) (*DocsService, string, string) {
	t.Helper()
	s, root := newTestService(t)
	cache := t.TempDir()
	s.SetCacheDir(cache)
	return s, root, cache
}

func deliverAll(t *testing.T, s *DocsService) {
	t.Helper()
	res, err := s.Scan()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.ReadBatch(res.Changed); err != nil {
		t.Fatal(err)
	}
}

func TestCacheRoundTripLoadsStamps(t *testing.T) {
	s, root, cache := cacheService(t)
	if got, err := s.LoadCache("p1"); err != nil || got != nil {
		t.Fatalf("no cache yet: %s %v", got, err)
	}
	deliverAll(t, s)
	if err := s.SaveCache("p1", json.RawMessage(`{"files":{"a":1}}`)); err != nil {
		t.Fatal(err)
	}

	// A fresh service (the next launch) gets the index back and a stat-only diff.
	s2 := NewService(s.roots, nil)
	s2.SetCacheDir(cache)
	got, err := s2.LoadCache("p1")
	if err != nil || string(got) != `{"files":{"a":1}}` {
		t.Fatalf("LoadCache: %s %v", got, err)
	}
	if res, _ := s2.Scan(); len(res.Changed) != 0 || len(res.Removed) != 0 {
		t.Fatalf("warm Scan should report nothing: %+v", res)
	}
	write(t, root, "modules/a/issues/01-x.md", "# One, edited\n")
	if res, _ := s2.Scan(); len(res.Changed) != 1 {
		t.Fatalf("edit not seen: %+v", res)
	}
}

func TestCacheNeverWritesInsideDocsRoot(t *testing.T) {
	s, root, _ := cacheService(t)
	deliverAll(t, s)
	before := listAll(t, root)
	if err := s.SaveCache("p", json.RawMessage(`{}`)); err != nil {
		t.Fatal(err)
	}
	if after := listAll(t, root); strings.Join(before, "|") != strings.Join(after, "|") {
		t.Fatalf("docs root changed:\n%v\n%v", before, after)
	}
}

func listAll(t *testing.T, root string) []string {
	t.Helper()
	var out []string
	_ = filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		out = append(out, p)
		return nil
	})
	return out
}

// AC3: a different parserVersion is a cold start.
func TestCacheDroppedWhenParserVersionChanges(t *testing.T) {
	s, _, cache := cacheService(t)
	deliverAll(t, s)
	if err := s.SaveCache("old", json.RawMessage(`{}`)); err != nil {
		t.Fatal(err)
	}
	s2 := NewService(s.roots, nil)
	s2.SetCacheDir(cache)
	if got, err := s2.LoadCache("new"); err != nil || got != nil {
		t.Fatalf("want cold start, got %s %v", got, err)
	}
	// The stamps were not loaded, so everything is reported as changed.
	if res, _ := s2.Scan(); len(res.Changed) != res.Count || res.Count == 0 {
		t.Fatalf("cold Scan should list every file: %+v", res)
	}
}

func TestCacheDroppedWhenRootsChange(t *testing.T) {
	s, root, cache := cacheService(t)
	deliverAll(t, s)
	_ = s.SaveCache("p", json.RawMessage(`{}`))
	s2 := NewService(func() Roots { return Roots{Docs: root, Roots: []string{"modules"}} }, nil)
	s2.SetCacheDir(cache)
	if got, _ := s2.LoadCache("p"); got != nil {
		t.Fatalf("different roots must not hit: %s", got)
	}
}

func TestCorruptCacheIsDeleted(t *testing.T) {
	s, _, cache := cacheService(t)
	deliverAll(t, s)
	_ = s.SaveCache("p", json.RawMessage(`{}`))
	files, _ := filepath.Glob(filepath.Join(cache, "*.json"))
	if len(files) != 1 {
		t.Fatalf("want one cache file, got %v", files)
	}
	if err := os.WriteFile(files[0], []byte(`{"v":1,"index":`), 0o644); err != nil {
		t.Fatal(err)
	}
	if got, err := s.LoadCache("p"); got != nil || err != nil {
		t.Fatalf("corrupt: %s %v", got, err)
	}
	if _, err := os.Stat(files[0]); !os.IsNotExist(err) {
		t.Fatal("corrupt cache should be deleted")
	}
}

// SaveCache goes through a temp file and a rename: nothing partial is ever visible,
// and no temp file is left behind.
func TestSaveCacheIsAtomic(t *testing.T) {
	s, _, cache := cacheService(t)
	deliverAll(t, s)
	if err := s.SaveCache("p", json.RawMessage(`{"n":1}`)); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveCache("p", json.RawMessage(`{"n":2}`)); err != nil {
		t.Fatal(err)
	}
	entries, _ := os.ReadDir(cache)
	if len(entries) != 1 || strings.HasSuffix(entries[0].Name(), ".tmp") {
		t.Fatalf("leftovers in cache dir: %v", entries)
	}
	got, _ := s.LoadCache("p")
	if string(got) != `{"n":2}` {
		t.Fatalf("second save should win: %s", got)
	}

	// A failed write (the target is a non-empty directory) leaves no temp file.
	path, _ := s.cachePath(s.roots())
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(path, "blocker"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveCache("p", json.RawMessage(`{}`)); err == nil {
		t.Fatal("expected the rename onto a directory to fail")
	}
	entries, _ = os.ReadDir(cache)
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".tmp") {
			t.Fatalf("temp file left behind: %s", e.Name())
		}
	}
}
