package docs

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// AC2 (ticket 18, L6): a .md over 5 MB is skipped without being read, and reported with its size.
func TestReadBatchSkipsFilesOverTheCap(t *testing.T) {
	s, root := newTestService(t)
	big := strings.Repeat("a", 10<<20)
	write(t, root, "modules/a/issues/90-huge.md", big)
	write(t, root, "modules/a/issues/91-edge.md", strings.Repeat("b", MaxFileBytes))
	write(t, root, "modules/a/issues/92-over.md", strings.Repeat("c", MaxFileBytes+1))

	if _, err := s.Scan(); err != nil {
		t.Fatal(err)
	}
	all := []string{"modules/a/issues/01-x.md", "modules/a/issues/90-huge.md", "modules/a/issues/91-edge.md", "modules/a/issues/92-over.md"}
	res, err := s.ReadBatch(all)
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, f := range res.Files {
		got = append(got, f.Path)
	}
	if strings.Join(got, ",") != "modules/a/issues/01-x.md,modules/a/issues/91-edge.md" {
		t.Fatalf("files read: %v", got)
	}
	if len(res.TooLarge) != 2 || res.TooLarge[0] != (TooLargeFile{"modules/a/issues/90-huge.md", 10 << 20}) || res.TooLarge[1].Size != MaxFileBytes+1 {
		t.Fatalf("tooLarge: %+v", res.TooLarge)
	}
	if len(res.Failed) != 0 || len(res.Missing) != 0 {
		t.Fatalf("failed/missing: %+v", res)
	}

	// Delivered (the frontend holds a stub): the next scan is quiet, but names them as too large.
	again, err := s.Scan()
	if err != nil {
		t.Fatal(err)
	}
	if containsAll(again.Changed, "modules/a/issues/90-huge.md") || containsAll(again.Changed, "modules/a/issues/92-over.md") {
		t.Fatalf("changed on the second scan: %v", again.Changed)
	}
	if len(again.TooLarge) != 2 || again.TooLarge[0].Path != "modules/a/issues/90-huge.md" || again.TooLarge[1].Size != MaxFileBytes+1 {
		t.Fatalf("scan tooLarge: %+v", again.TooLarge)
	}
	// ReadFile refuses them with the size in the message.
	if _, err := s.ReadFile("modules/a/issues/90-huge.md"); err == nil || !strings.Contains(err.Error(), "10.0 MB") {
		t.Fatalf("ReadFile of the huge file: %v", err)
	}
	if _, err := s.ReadFile("modules/a/issues/92-over.md"); err == nil {
		t.Fatal("ReadFile of the file over the cap succeeded")
	}
	if text, err := s.ReadFile("modules/a/issues/91-edge.md"); err != nil || len(text) != MaxFileBytes {
		t.Fatalf("ReadFile at the cap: %d %v", len(text), err)
	}

	// A deleted oversized file is reported as removed.
	if err := os.Remove(filepath.Join(root, "modules", "a", "issues", "90-huge.md")); err != nil {
		t.Fatal(err)
	}
	if gone, err := s.Scan(); err != nil || len(gone.Removed) != 1 || gone.Removed[0] != "modules/a/issues/90-huge.md" {
		t.Fatalf("after delete: %+v %v", gone, err)
	}
}

func containsAll(list []string, want ...string) bool {
	for _, w := range want {
		found := false
		for _, l := range list {
			found = found || l == w
		}
		if !found {
			return false
		}
	}
	return true
}

// A file that grows past the cap between the stat and the read is still not delivered.
func TestReadTextRefusesAFileThatGrew(t *testing.T) {
	p := filepath.Join(t.TempDir(), "a.md")
	if err := os.WriteFile(p, []byte(strings.Repeat("x", MaxFileBytes+1)), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := readText(p); err != errFileGrew {
		t.Fatalf("readText: %v", err)
	}
}

// AC3 (ticket 18, L5): the cache folder is deleted, and stays deleted for this run.
func TestClearCacheDeletesOnlyTheCacheFolder(t *testing.T) {
	s, _ := newTestService(t)
	folio := filepath.Join(t.TempDir(), "Folio")
	cache := filepath.Join(folio, "cache")
	s.setCacheDir(cache)
	deliverAll(t, s)
	if err := s.SaveCache("p1", []byte(`{"a":1}`)); err != nil {
		t.Fatal(err)
	}
	keep := filepath.Join(folio, "keep.txt")
	if err := os.WriteFile(keep, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	res, err := s.ClearCache()
	if err != nil || !res.CacheDeleted || res.CacheDir != cache {
		t.Fatalf("ClearCache: %+v %v", res, err)
	}
	if _, err := os.Stat(cache); err == nil {
		t.Fatal("cache folder is still there")
	}
	if _, err := os.Stat(keep); err != nil {
		t.Fatal("a sibling of the cache folder was deleted")
	}
	if err := s.SaveCache("p1", []byte(`{"a":2}`)); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(cache); err == nil {
		t.Fatal("the cache was written again after Clear data")
	}
	if res, err := s.ClearCache(); err != nil || res.CacheDeleted {
		t.Fatalf("second ClearCache: %+v %v", res, err)
	}
}

func TestClearCacheRefusesFoldersThatAreNotFolioCaches(t *testing.T) {
	s, _ := newTestService(t)
	for _, dir := range []string{t.TempDir(), filepath.Join(t.TempDir(), "cache"), filepath.Join(t.TempDir(), "Folio")} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		s.setCacheDir(dir)
		if _, err := s.ClearCache(); err == nil {
			t.Errorf("ClearCache accepted %q", dir)
		}
		if _, err := os.Stat(dir); err != nil {
			t.Errorf("%q was deleted", dir)
		}
	}
}
