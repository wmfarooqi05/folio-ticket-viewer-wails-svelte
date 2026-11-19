package shell

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
)

// A directory junction needs no admin rights (unlike a symlink), so this runs on a normal
// Windows account. The test fails, not skips, if the junction cannot be made there.
func TestDocAssetsRefusesJunctionOutOfRoot(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("junctions are a Windows feature")
	}
	base := t.TempDir()
	root := filepath.Join(base, "docs")
	outside := filepath.Join(base, "outside")
	for _, d := range []string{filepath.Join(root, "modules", "a"), outside} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(outside, "secret.png"), []byte("OUTSIDE"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "modules", "a", "ok.png"), []byte("INSIDE"), 0o644); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(root, "modules", "a", "j")
	if out, err := exec.Command("cmd", "/c", "mklink", "/J", link, outside).CombinedOutput(); err != nil {
		t.Fatalf("mklink /J failed: %v: %s", err, out)
	}

	if rec := serve(t, root, "GET", "/doc/modules/a/ok.png"); rec.Code != 200 {
		t.Fatalf("control file: %d", rec.Code)
	}
	for _, target := range []string{
		"/doc/modules/a/j/secret.png",
		"/doc/modules/a/j/secret.png::$DATA",
		"/doc/modules/a/ok.png::$DATA",
		"/doc/modules/a/ok.png:stream",
	} {
		rec := serve(t, root, "GET", target)
		if rec.Code != 404 {
			t.Errorf("%s = %d, want 404 (body %q)", target, rec.Code, rec.Body.String())
		}
		if rec.Body.String() == "OUTSIDE" {
			t.Errorf("%s served the file outside the root", target)
		}
	}
}
