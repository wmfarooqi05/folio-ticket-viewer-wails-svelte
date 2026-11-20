package localdata

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
)

// A second Folio's start must not half-delete the first one's live profile: the folder is renamed
// first, which fails while a file inside is open, and then nothing has been deleted.
func TestRunPendingLeavesAProfileInUse(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("a directory with an open file inside can be renamed elsewhere")
	}
	p := testPaths(t)
	profile := filepath.Join(p.LocalAppData, "Folio", "WebView2")
	busy := filepath.Join(profile, "Default", "Cookies")
	mkfile(t, busy)
	mkfile(t, filepath.Join(p.AppData, "folio.exe", "EBWebView", "x"))
	if err := p.SchedulePurge(); err != nil {
		t.Fatal(err)
	}
	f, err := os.Open(busy) // what the running instance's WebView2 has open
	if err != nil {
		t.Fatal(err)
	}
	removed, err := p.RunPending()
	_ = f.Close()
	if err == nil {
		t.Fatalf("RunPending deleted a profile that is in use: %v", removed)
	}
	if !exists(busy) || !exists(filepath.Join(p.LocalAppData, "Folio", MarkerName)) {
		t.Fatal("the busy profile or the marker was lost")
	}
	// the file is closed now: the next start finishes the job
	if removed, err := p.RunPending(); err != nil || exists(profile) || len(removed) == 0 {
		t.Fatalf("second RunPending: %v %v", removed, err)
	}
}

// A junction in the way is refused, and what it points at survives.
func TestRunPendingRefusesALinkedProfile(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("junctions are a Windows thing")
	}
	p := testPaths(t)
	target := filepath.Join(t.TempDir(), "precious")
	mkfile(t, filepath.Join(target, "a.txt"))
	if err := os.MkdirAll(filepath.Join(p.LocalAppData, "Folio"), 0o755); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(p.LocalAppData, "Folio", "WebView2")
	if out, err := exec.Command("cmd", "/c", "mklink", "/J", link, target).CombinedOutput(); err != nil {
		t.Skipf("mklink /J: %v %s", err, out)
	}
	if err := p.SchedulePurge(); err != nil {
		t.Fatal(err)
	}
	if _, err := p.RunPending(); err == nil {
		t.Fatal("a junction profile was not refused")
	}
	if !exists(filepath.Join(target, "a.txt")) {
		t.Fatal("the junction's target was deleted")
	}
}
