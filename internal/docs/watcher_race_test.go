package docs

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func readersAlive() int {
	buf := make([]byte, 1<<22)
	n := runtime.Stack(buf, true)
	return strings.Count(string(buf[:n]), "readDirChangesW).readEvents")
}

// A double overflow must not leak the old watcher's reader and directory handles:
// closeAsync drains until Errors is quiet before it calls Close.
func TestOverflowDoesNotLeakReaders(t *testing.T) {
	time.Sleep(300 * time.Millisecond)
	base := readersAlive()
	old := watchBufferSize
	watchBufferSize = 4096
	t.Cleanup(func() { watchBufferSize = old })
	r := newWatchRig(t, "modules/a/01.md", "modules/b/01.md")
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
	deadline := time.After(15 * time.Second)
	for sawRescan := false; !sawRescan; {
		select {
		case cs := <-r.got:
			sawRescan = cs.Rescan
		case <-deadline:
			t.Fatal("no Rescan ChangeSet after a real overflow")
		}
	}
	_ = r.s.ServiceShutdown()
	time.Sleep(6 * time.Second) // past closeAsync's 5 s give-up
	if n := readersAlive() - base; n > 0 {
		t.Fatalf("%d fsnotify reader goroutines leaked", n)
	}
}

// A rescan for a watcher that has been replaced (a Settings root change got there
// first) neither emits nor touches the watcher.
func TestStaleRescanAfterErrorIsDropped(t *testing.T) {
	r := newWatchRig(t, "modules/a/01.md")
	r.s.mu.Lock()
	failing := r.s.watch
	r.s.mu.Unlock()
	if _, err := r.s.Rescan(); err != nil { // the Settings path: installs a newer watcher
		t.Fatal(err)
	}
	r.s.mu.Lock()
	current := r.s.watch
	r.s.mu.Unlock()
	if current == failing {
		t.Fatal("Rescan should have replaced the watcher")
	}
	r.s.rescanAfterError(failing)
	r.quiet(t, 300*time.Millisecond)
	r.s.mu.Lock()
	same := r.s.watch == current
	r.s.mu.Unlock()
	if !same {
		t.Fatal("a stale rescan replaced the newer watcher")
	}
}

// A scan whose roots changed while it ran is discarded and leaves the stamps alone.
func TestScanSupersededByRootChange(t *testing.T) {
	r := newWatchRig(t, "modules/a/01.md")
	r.s.mu.Lock()
	before := len(r.s.stamps)
	r.s.mu.Unlock()
	calls := 0
	docs := r.root
	r.s.roots = func() Roots {
		calls++
		if calls == 1 {
			return Roots{Docs: docs, Roots: []string{"modules"}}
		}
		return Roots{Docs: docs, Roots: []string{"patterns"}} // changed after the walk began
	}
	if _, err := r.s.Scan(); !errors.Is(err, errSuperseded) {
		t.Fatalf("want errSuperseded, got %v", err)
	}
	r.s.mu.Lock()
	after := len(r.s.stamps)
	r.s.mu.Unlock()
	if before != after || before == 0 {
		t.Fatalf("stamps changed: %d -> %d", before, after)
	}
}
