package localdata

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/docs"
)

func testPaths(t *testing.T) Paths {
	t.Helper()
	root := t.TempDir()
	return Paths{LocalAppData: filepath.Join(root, "Local"), AppData: filepath.Join(root, "Roaming"), ExeName: "folio.exe"}
}

func mkfile(t *testing.T, p string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
}

func exists(p string) bool { _, err := os.Lstat(p); return err == nil }

func TestProfileDirsAreFolioOwned(t *testing.T) {
	p := testPaths(t)
	dirs := p.ProfileDirs()
	want := []string{filepath.Join(p.LocalAppData, "Folio", "WebView2"), filepath.Join(p.AppData, "folio.exe")}
	if len(dirs) != 2 || dirs[0] != want[0] || dirs[1] != want[1] {
		t.Fatalf("ProfileDirs: %v, want %v", dirs, want)
	}
	// An exe name that is not an .exe, or an empty environment, adds no folder to delete.
	p.ExeName = "Roaming"
	if got := p.ProfileDirs(); len(got) != 1 {
		t.Fatalf("a non-.exe name must not name a folder: %v", got)
	}
	if got := (Paths{}).ProfileDirs(); len(got) != 0 {
		t.Fatalf("empty environment: %v", got)
	}
}

// AC3: after Clear data and the next start, the cache and both profile folders are gone and
// nothing else is.
func TestClearDataThenNextStart(t *testing.T) {
	p := testPaths(t)
	cache := filepath.Join(p.LocalAppData, "Folio", "cache")
	newProfile := filepath.Join(p.LocalAppData, "Folio", "WebView2")
	oldProfile := filepath.Join(p.AppData, "folio.exe")
	settingsFile := filepath.Join(p.AppData, "Folio", "settings.json")
	other := filepath.Join(p.AppData, "other-app", "data.txt")
	for _, f := range []string{filepath.Join(cache, "a.json"), filepath.Join(newProfile, "Default", "Cookies"), filepath.Join(oldProfile, "EBWebView", "x"), settingsFile, other} {
		mkfile(t, f)
	}

	svc := &LocalDataService{docs: docs.NewService(func() docs.Roots { return docs.Roots{} }, nil), paths: p}
	// point the docs service at the test cache folder through its environment-free default
	t.Setenv("LOCALAPPDATA", p.LocalAppData)
	res, err := svc.ClearData()
	if err != nil {
		t.Fatal(err)
	}
	if !res.CacheDeleted || !res.ProfileScheduled || len(res.ProfileDirs) != 2 {
		t.Fatalf("result: %+v", res)
	}
	if exists(cache) {
		t.Fatal("the cache is still there")
	}
	// the profile is locked by the running WebView2: still there until the next start
	if !exists(newProfile) || !exists(oldProfile) || !exists(filepath.Join(p.LocalAppData, "Folio", MarkerName)) {
		t.Fatal("the profile must wait for the next start")
	}

	removed, err := p.RunPending()
	if err != nil || len(removed) != 2 {
		t.Fatalf("RunPending: %v %v", removed, err)
	}
	if exists(newProfile) || exists(oldProfile) || exists(filepath.Join(p.LocalAppData, "Folio", MarkerName)) {
		t.Fatal("the profile folders or the marker are still there")
	}
	if !exists(settingsFile) || !exists(other) {
		t.Fatal("something outside Folio's cache and profile was deleted")
	}
	// no marker, nothing to do
	if removed, err := p.RunPending(); err != nil || len(removed) != 0 {
		t.Fatalf("second RunPending: %v %v", removed, err)
	}
}

func TestRemoveGuardedRefusesEverythingElse(t *testing.T) {
	p := testPaths(t)
	allowed := p.ProfileDirs()
	victim := filepath.Join(p.AppData, "Documents")
	mkfile(t, filepath.Join(victim, "a.txt"))
	for _, dir := range []string{victim, p.AppData, filepath.Dir(p.AppData), `C:\`, "relative", "", filepath.Join(allowed[0], "..")} {
		if ok, err := removeGuarded(dir, allowed, p.AppData); ok || err == nil {
			t.Errorf("removeGuarded(%q) = %v, %v", dir, ok, err)
		}
	}
	if !exists(filepath.Join(victim, "a.txt")) {
		t.Fatal("a folder outside the allowed list was deleted")
	}
	// an allowed folder that does not exist is not an error
	if ok, err := removeGuarded(allowed[0], allowed, p.AppData); ok || err != nil {
		t.Errorf("missing allowed folder: %v %v", ok, err)
	}
}
