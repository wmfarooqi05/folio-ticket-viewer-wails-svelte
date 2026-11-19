package shell

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/settings"
)

func mkdir(t *testing.T, parts ...string) string {
	t.Helper()
	p := filepath.Join(parts...)
	if err := os.MkdirAll(p, 0o755); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestInspectRootAcceptsRepoRoot(t *testing.T) {
	repo := t.TempDir()
	mkdir(t, repo, "docs", "modules")
	got := InspectRoot(repo, nil)
	if !got.OK || got.RepoRoot != repo || got.DocsDir != "docs" {
		t.Fatalf("unexpected: %+v", got)
	}
	if len(got.Found) != 1 || got.Found[0] != "modules" || len(got.Missing) != 2 {
		t.Fatalf("found/missing wrong: %+v", got)
	}
}

func TestInspectRootAcceptsDocsFolder(t *testing.T) {
	repo := t.TempDir()
	docsDir := mkdir(t, repo, "mydocs")
	mkdir(t, docsDir, "handoffs")
	got := InspectRoot(docsDir, nil)
	if !got.OK || got.RepoRoot != repo || got.DocsDir != "mydocs" {
		t.Fatalf("unexpected: %+v", got)
	}
}

func TestInspectRootRejectsOthers(t *testing.T) {
	empty := t.TempDir()
	if got := InspectRoot(empty, nil); got.OK || got.Message == "" {
		t.Fatalf("empty folder accepted: %+v", got)
	}
	if got := InspectRoot(filepath.Join(empty, "nope"), nil); got.OK {
		t.Fatalf("missing folder accepted: %+v", got)
	}
}

func TestSetConfigValidatesAndPersists(t *testing.T) {
	t.Setenv(EnvRoot, "")
	repo := t.TempDir()
	mkdir(t, repo, "docs", "patterns")
	path := filepath.Join(t.TempDir(), "settings.json")
	svc := New(path)

	cfg, err := svc.GetConfig()
	if err != nil || cfg.RepoRoot != "" {
		t.Fatalf("first run should have no repoRoot: %+v %v", cfg, err)
	}

	bad := filepath.Join(repo, "missing")
	if _, err := svc.SetConfig(ConfigPatch{RepoRoot: &bad}); err == nil {
		t.Fatal("expected validation error")
	}
	if _, err := os.Stat(path); err == nil {
		t.Fatal("invalid config must not be written")
	}

	theme := settings.ThemeDark
	got, err := svc.SetConfig(ConfigPatch{RepoRoot: &repo, Theme: &theme})
	if err != nil {
		t.Fatal(err)
	}
	if got.RepoRoot != repo || got.Theme != settings.ThemeDark || got.Window.Width == 0 {
		t.Fatalf("patch not applied or window clobbered: %+v", got)
	}
	reloaded := New(path)
	if c, _ := reloaded.GetConfig(); c.RepoRoot != repo {
		t.Fatalf("not persisted: %+v", c)
	}
	if r := RootsOf(reloaded); r.Docs != filepath.Join(repo, "docs") {
		t.Fatalf("roots: %+v", r)
	}
}

func TestEnvOverrideIsNotPersisted(t *testing.T) {
	repo := t.TempDir()
	docsDir := mkdir(t, repo, "docs")
	mkdir(t, docsDir, "modules")
	t.Setenv(EnvRoot, docsDir)
	path := filepath.Join(t.TempDir(), "settings.json")
	svc := New(path)

	cfg, _ := svc.GetConfig()
	if cfg.RepoRoot != repo || cfg.DocsDir != "docs" {
		t.Fatalf("override not applied: %+v", cfg)
	}
	theme := settings.ThemeLight
	if _, err := svc.SetConfig(ConfigPatch{Theme: &theme}); err != nil {
		t.Fatal(err)
	}
	saved, _ := settings.Load(path)
	if saved.RepoRoot != "" {
		t.Fatalf("FOLIO_ROOT leaked into settings.json: %+v", saved)
	}
}

func TestSidebarWidthRoundTripsAndSurvivesSetConfig(t *testing.T) {
	t.Setenv(EnvRoot, "")
	repo := t.TempDir()
	mkdir(t, repo, "docs", "patterns")
	path := filepath.Join(t.TempDir(), "settings.json")
	svc := New(path)

	if c, _ := svc.GetConfig(); c.SidebarWidth != 0 {
		t.Fatalf("default should be unset (0): %d", c.SidebarWidth)
	}
	if got, err := svc.SetSidebarWidth(340); err != nil || got != 340 {
		t.Fatalf("save: %d %v", got, err)
	}
	if got, _ := svc.SetSidebarWidth(9999); got != settings.MaxSidebarWidth {
		t.Fatalf("not clamped: %d", got)
	}
	if _, err := svc.SetSidebarWidth(340); err != nil {
		t.Fatal(err)
	}

	// a hand edit made while the app runs must survive the width save
	data, _ := os.ReadFile(path)
	edited := strings.Replace(string(data), `"theme": "system"`, `"theme": "dark"`, 1)
	if err := os.WriteFile(path, []byte(edited), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetSidebarWidth(300); err != nil {
		t.Fatal(err)
	}
	if c, _ := svc.GetConfig(); c.Theme != settings.ThemeDark {
		t.Fatalf("hand edit lost: %+v", c)
	}

	// SetConfig must not clobber the width
	auto := settings.DefaultDocsDir
	got, err := svc.SetConfig(ConfigPatch{RepoRoot: &repo, DocsDir: &auto})
	if err != nil || got.SidebarWidth != 300 {
		t.Fatalf("SetConfig lost the width: %+v %v", got, err)
	}
	if c, _ := New(path).GetConfig(); c.SidebarWidth != 300 || c.RepoRoot != repo || c.Window.Width == 0 {
		t.Fatalf("not persisted: %+v", c)
	}
}

func TestPanelWidthAndCollapsedRoundTripAndSurviveSetConfig(t *testing.T) {
	t.Setenv(EnvRoot, "")
	repo := t.TempDir()
	mkdir(t, repo, "docs", "patterns")
	path := filepath.Join(t.TempDir(), "settings.json")
	svc := New(path)

	if c, _ := svc.GetConfig(); c.PanelWidth != 0 || c.SidebarCollapsed {
		t.Fatalf("defaults should be unset: %+v", c)
	}
	if got, err := svc.SetPanelWidth(500); err != nil || got != 500 {
		t.Fatalf("save: %d %v", got, err)
	}
	if got, _ := svc.SetPanelWidth(10); got != settings.MinPanelWidth {
		t.Fatalf("not clamped up: %d", got)
	}
	if got, _ := svc.SetPanelWidth(99999); got != settings.MaxPanelWidth {
		t.Fatalf("not clamped down: %d", got)
	}
	if _, err := svc.SetPanelWidth(480); err != nil {
		t.Fatal(err)
	}
	if got, err := svc.SetSidebarCollapsed(true); err != nil || !got {
		t.Fatalf("collapse: %v %v", got, err)
	}
	if _, err := svc.SetSidebarWidth(300); err != nil {
		t.Fatal(err)
	}

	// each setter changed only its own field
	c, _ := svc.GetConfig()
	if c.PanelWidth != 480 || !c.SidebarCollapsed || c.SidebarWidth != 300 {
		t.Fatalf("fields leaked into each other: %+v", c)
	}

	// a hand edit made while the app runs must survive a save
	data, _ := os.ReadFile(path)
	edited := strings.Replace(string(data), `"theme": "system"`, `"theme": "dark"`, 1)
	if err := os.WriteFile(path, []byte(edited), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetSidebarCollapsed(false); err != nil {
		t.Fatal(err)
	}
	if c, _ := svc.GetConfig(); c.Theme != settings.ThemeDark || c.PanelWidth != 480 {
		t.Fatalf("hand edit or width lost: %+v", c)
	}
	if _, err := svc.SetSidebarCollapsed(true); err != nil {
		t.Fatal(err)
	}

	// SetConfig must keep both
	auto := settings.DefaultDocsDir
	got, err := svc.SetConfig(ConfigPatch{RepoRoot: &repo, DocsDir: &auto})
	if err != nil || got.PanelWidth != 480 || !got.SidebarCollapsed {
		t.Fatalf("SetConfig lost the UI state: %+v %v", got, err)
	}
	if c, _ := New(path).GetConfig(); c.PanelWidth != 480 || !c.SidebarCollapsed || c.RepoRoot != repo {
		t.Fatalf("not persisted: %+v", c)
	}
}
