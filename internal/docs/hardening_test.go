package docs

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// A save already in flight must not re-create the cache after Clear data deleted it.
func TestClearCacheWaitsForASaveInFlight(t *testing.T) {
	s, _ := newTestService(t)
	cache := filepath.Join(t.TempDir(), "Folio", "cache")
	s.setCacheDir(cache)
	deliverAll(t, s)

	inWrite := make(chan struct{})
	release := make(chan struct{})
	beforeCacheWrite = func() {
		close(inWrite)
		<-release
	}
	defer func() { beforeCacheWrite = nil }()

	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		if err := s.SaveCache("p1", []byte(`{"a":1}`)); err != nil {
			t.Error(err)
		}
	}()
	<-inWrite // the save has built its envelope and is about to write
	cleared := make(chan struct{})
	go func() {
		defer wg.Done()
		if _, err := s.ClearCache(); err != nil {
			t.Error(err)
		}
		close(cleared)
	}()
	select {
	case <-cleared:
		t.Fatal("ClearCache did not wait for the save in flight")
	case <-time.After(150 * time.Millisecond):
	}
	close(release)
	wg.Wait()
	if _, err := os.Stat(cache); err == nil {
		t.Fatal("the cache exists after Clear data: the save won the race")
	}
}

// A folder named *.md is not a document: it is reported as failed by ReadBatch, refused by ReadFile,
// and not listed by Scan. (A FIFO or device would block on open; the same check covers them.)
func TestNonRegularFilesAreNotRead(t *testing.T) {
	s, root := newTestService(t)
	if err := os.MkdirAll(filepath.Join(root, "modules", "a", "folder.md"), 0o755); err != nil {
		t.Fatal(err)
	}
	scan, err := s.Scan()
	if err != nil {
		t.Fatal(err)
	}
	if containsAll(scan.Changed, "modules/a/folder.md") {
		t.Fatal("a folder was listed as a document")
	}
	res, err := s.ReadBatch([]string{"modules/a/folder.md"})
	if err != nil || len(res.Failed) != 1 || len(res.Files) != 0 || len(res.Missing) != 0 {
		t.Fatalf("ReadBatch: %+v %v", res, err)
	}
	if _, err := s.ReadFile("modules/a/folder.md"); err == nil || !strings.Contains(err.Error(), "regular") {
		t.Fatalf("ReadFile: %v", err)
	}
}
