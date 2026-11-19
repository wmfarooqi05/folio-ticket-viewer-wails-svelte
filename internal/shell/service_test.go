package shell

import (
	"os"
	"path/filepath"
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
