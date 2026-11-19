package docs

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
)

func TestSafeJoinRefusesJunctionAndStreams(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("junctions are a Windows feature")
	}
	base := t.TempDir()
	root := filepath.Join(base, "docs")
	outside := filepath.Join(base, "outside")
	for _, d := range []string{filepath.Join(root, "modules"), outside} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(outside, "secret.md"), []byte("OUTSIDE"), 0o644); err != nil {
		t.Fatal(err)
	}
	if out, err := exec.Command("cmd", "/c", "mklink", "/J", filepath.Join(root, "modules", "j"), outside).CombinedOutput(); err != nil {
		t.Fatalf("mklink /J failed: %v: %s", err, out)
	}
	for _, rel := range []string{"modules/j/secret.md", "modules/j/secret.md::$DATA", "modules/x.md:stream", "modules/j"} {
		if _, err := SafeJoin(root, rel); !errors.Is(err, ErrEscapesRoot) {
			t.Errorf("SafeJoin(%q) = %v, want ErrEscapesRoot", rel, err)
		}
	}
	// a path that does not exist yet is still allowed (the read then fails with not-exist)
	if _, err := SafeJoin(root, "modules/nope.md"); err != nil {
		t.Errorf("missing file: %v", err)
	}
}
