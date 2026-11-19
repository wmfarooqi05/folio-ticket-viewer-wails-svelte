package shell

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/docs"
	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/settings"
)

func TestInspectDocs(t *testing.T) {
	repo := t.TempDir()
	mkdir(t, repo, "mydocs", "modules")
	got := InspectDocs(repo, "mydocs", []string{"modules", "handoffs", "patterns"})
	if !got.OK || len(got.Found) != 1 || len(got.Missing) != 2 {
		t.Fatalf("found/missing wrong: %+v", got)
	}
	if got := InspectDocs(repo, "docs", nil); got.OK || got.Message == "" {
		t.Fatalf("no roots must not be OK: %+v", got)
	}
	if got := InspectDocs(repo, "../elsewhere", nil); got.OK {
		t.Fatalf("docs dir outside the repo accepted: %+v", got)
	}
	if got := InspectDocs(filepath.Join(repo, "nope"), "docs", nil); got.OK {
		t.Fatalf("missing repo accepted: %+v", got)
	}
	if got := InspectDocs(repo, "a/../../x", nil); got.OK {
		t.Fatalf("a/../../x accepted: %+v", got)
	}
	if got := InspectDocs(repo, "mydocs", []string{"modules", "../x"}); got.OK {
		t.Fatalf("escaping root accepted: %+v", got)
	}
}

func TestSetConfigKeepsHandEditedSettings(t *testing.T) {
	t.Setenv(EnvRoot, "")
	repo := t.TempDir()
	mkdir(t, repo, "docs", "modules")
	path := filepath.Join(t.TempDir(), "settings.json")
	svc := New(path)
	theme := settings.ThemeLight
	if _, err := svc.SetConfig(ConfigPatch{RepoRoot: &repo, Theme: &theme}); err != nil {
		t.Fatal(err)
	}
	// The user edits the file by hand while the app runs.
	ado := "https://dev.azure.com/hand/edited/{id}"
	disk, _ := settings.Load(path)
	disk.AdoWorkItemURL = ado
	if err := settings.Save(path, disk); err != nil {
		t.Fatal(err)
	}
	dark := settings.ThemeDark
	got, err := svc.SetConfig(ConfigPatch{Theme: &dark})
	if err != nil {
		t.Fatal(err)
	}
	if got.AdoWorkItemURL != ado || got.Theme != settings.ThemeDark {
		t.Fatalf("hand edit lost or patch not applied: %+v", got)
	}
	if after, _ := settings.Load(path); after.AdoWorkItemURL != ado {
		t.Fatalf("hand edit overwritten on disk: %+v", after)
	}
}

func TestSettingsRoundTripKeepsUnknownKeysAndWindow(t *testing.T) {
	t.Setenv(EnvRoot, "")
	repo := t.TempDir()
	mkdir(t, repo, "docs", "modules")
	path := filepath.Join(t.TempDir(), "settings.json")
	seed := `{"v":1,"futureKey":{"a":1},"window":{"x":5,"y":6,"width":1000,"height":700,"maximised":false}}`
	if err := os.WriteFile(path, []byte(seed), 0o644); err != nil {
		t.Fatal(err)
	}
	svc := New(path)
	tpl := "https://dev.azure.com/acme/p/_workitems/edit/{id}"
	if _, err := svc.SetConfig(ConfigPatch{RepoRoot: &repo, AdoWorkItemURL: &tpl}); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(path)
	if !strings.Contains(string(raw), "futureKey") || !strings.Contains(string(raw), `"width": 1000`) {
		t.Fatalf("unknown key or window lost:\n%s", raw)
	}
	reloaded, err := settings.Load(path)
	if err != nil || reloaded.AdoWorkItemURL != tpl || reloaded.RepoRoot != repo {
		t.Fatalf("reload: %+v %v", reloaded, err)
	}
	bad := "http://insecure/{id}"
	if _, err := svc.SetConfig(ConfigPatch{AdoPRURL: &bad}); err == nil {
		t.Fatal("http:// template accepted")
	}
	noID := "https://dev.azure.com/x/"
	if _, err := svc.SetConfig(ConfigPatch{AdoPRURL: &noID}); err == nil {
		t.Fatal("template without {id} accepted")
	}
}

// First run, end to end on the Go side (ticket 13 AC2): no settings.json, the user
// "picks" the fixture repo, CheckRoot, SetConfig, then the scan reads the roots from
// the saved config. It also proves AC3: nothing under the fixtures changes, and the
// only file written is settings.json.
func TestFirstRunFlowAgainstFixtures(t *testing.T) {
	t.Setenv(EnvRoot, "")
	fixtures, err := filepath.Abs(filepath.Join("..", "..", "fixtures"))
	if err != nil {
		t.Fatal(err)
	}
	before := snapshot(t, fixtures)

	cfgDir := t.TempDir() // stands in for %APPDATA%
	path := filepath.Join(cfgDir, "Folio", "settings.json")
	svc := New(path)
	if _, err := os.Stat(path); err == nil {
		t.Fatal("settings.json must not exist before the first save")
	}
	if cfg, _ := svc.GetConfig(); cfg.RepoRoot != "" {
		t.Fatalf("first run must have no repoRoot: %+v", cfg)
	}

	// The picked folder may be the repo root or the docs folder: both resolve.
	for _, picked := range []string{fixtures, filepath.Join(fixtures, "docs")} {
		rc, err := svc.CheckRoot(picked)
		if err != nil || !rc.OK || rc.DocsDir != "docs" || len(rc.Found) != 3 {
			t.Fatalf("CheckRoot(%s): %+v %v", picked, rc, err)
		}
	}
	rc, _ := svc.CheckRoot(fixtures)
	if _, err := os.Stat(path); err == nil {
		t.Fatal("CheckRoot must not write anything")
	}

	if _, err := svc.SetConfig(ConfigPatch{RepoRoot: &rc.RepoRoot, DocsDir: &rc.DocsDir}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("SetConfig must create settings.json: %v", err)
	}

	ds := docs.NewService(func() docs.Roots { return RootsOf(svc) }, func(docs.ChangeSet) {})
	t.Cleanup(func() { _ = ds.ServiceShutdown() })
	res, err := ds.Scan()
	if err != nil {
		t.Fatalf("scan: %v", err)
	}
	if res.Count == 0 || len(res.Changed) != res.Count {
		t.Fatalf("scan found nothing: %+v", res)
	}
	batch, err := ds.ReadBatch(res.Changed[:1])
	if err != nil || len(batch.Files) != 1 {
		t.Fatalf("ReadBatch: %+v %v", batch, err)
	}

	// Narrowing the roots later (Settings dialog) changes the scan; no ticket is touched.
	only := []string{"modules"}
	if _, err := svc.SetConfig(ConfigPatch{DocsRoots: &only}); err != nil {
		t.Fatal(err)
	}
	if _, err := ds.ReadBatch(res.Changed); err != nil {
		t.Fatal(err)
	}
	res2, err := ds.Rescan()
	if err != nil || res2.Count == 0 || res2.Count >= res.Count || len(res2.Changed) != res2.Count {
		t.Fatalf("narrowing roots should shrink the scan and list every file: %d vs %d (%v)", res2.Count, res.Count, err)
	}

	after := snapshot(t, fixtures)
	if len(before) != len(after) {
		t.Fatalf("fixture file set changed: %d -> %d", len(before), len(after))
	}
	for k, v := range before {
		if after[k] != v {
			t.Fatalf("ticket file changed: %s", k)
		}
	}
	entries, _ := os.ReadDir(filepath.Join(cfgDir, "Folio"))
	for _, e := range entries {
		if e.Name() != "settings.json" {
			t.Errorf("unexpected file next to settings.json: %s", e.Name())
		}
	}
}

// snapshot maps every file under dir to its size and mtime.
func snapshot(t *testing.T, dir string) map[string]string {
	t.Helper()
	out := map[string]string{}
	err := filepath.WalkDir(dir, func(p string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		out[p] = info.ModTime().String() + "/" + strconv.FormatInt(info.Size(), 10)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return out
}
