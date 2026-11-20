package shell

import (
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/settings"
)

func put(t *testing.T, root, rel string) {
	t.Helper()
	full := filepath.Join(root, filepath.FromSlash(rel))
	mkdir(t, filepath.Dir(full))
	if err := os.WriteFile(full, []byte("# x\n"), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestInspectRootDetectsAGenericLayout(t *testing.T) {
	repo := t.TempDir()
	put(t, repo, "docs/map.md")
	put(t, repo, "docs/issues/01-a.md")
	put(t, repo, "docs/assets/a.md")
	got := InspectRoot(repo, nil)
	if !got.OK || got.RepoRoot != repo || got.DocsDir != "docs" || !slices.Equal(got.Suggested, []string{"."}) || !slices.Equal(got.Found, []string{"."}) {
		t.Fatalf("unexpected: %+v", got)
	}
	if !slices.Equal(got.Folders, []string{"assets", "issues"}) {
		t.Fatalf("folders: %v", got.Folders)
	}
	// the docs folder itself works the same
	if d := InspectRoot(filepath.Join(repo, "docs"), nil); !d.OK || d.RepoRoot != repo || !slices.Equal(d.Suggested, []string{"."}) {
		t.Fatalf("docs folder: %+v", d)
	}
}

func TestInspectRootKeepsTheDefaultLayoutAsIs(t *testing.T) {
	repo := t.TempDir()
	put(t, repo, "docs/modules/a/map.md")
	put(t, repo, "docs/map.md")
	got := InspectRoot(repo, nil)
	if !got.OK || len(got.Suggested) != 0 || !slices.Equal(got.Found, []string{"modules"}) {
		t.Fatalf("a modules layout must not be overridden: %+v", got)
	}
}

func TestInspectRootRefusesAFolderWithNeither(t *testing.T) {
	repo := t.TempDir()
	put(t, repo, "docs/readme.md")
	got := InspectRoot(repo, nil)
	if got.OK || got.Message != "expects modules/ · handoffs/ · patterns/, or a map.md or issues/ folder, inside the folder" {
		t.Fatalf("unexpected: %+v", got)
	}
}

func TestInspectDocsListsFoldersAndFindsTheWholeRoot(t *testing.T) {
	repo := t.TempDir()
	put(t, repo, "docs/guides/a.md")
	put(t, repo, "docs/_templates/t.md")
	put(t, repo, "docs/empty/x.txt")
	got := InspectDocs(repo, "docs", []string{".", "modules", "guides"})
	if !got.OK || !slices.Equal(got.Found, []string{".", "guides"}) || !slices.Equal(got.Missing, []string{"modules"}) || !slices.Equal(got.Folders, []string{"guides"}) {
		t.Fatalf("unexpected: %+v", got)
	}
}

func TestOverrideTakesTheSuggestedRoots(t *testing.T) {
	repo := t.TempDir()
	put(t, repo, "docs/issues/01-a.md")
	t.Setenv(EnvRoot, repo)
	svc := New(filepath.Join(t.TempDir(), "settings.json"))
	cfg, err := svc.GetConfig()
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(cfg.DocsRoots, []string{"."}) || cfg.RepoRoot != repo {
		t.Fatalf("unexpected: %+v", cfg)
	}
}

func TestWholeRootIsValid(t *testing.T) {
	repo := t.TempDir()
	put(t, repo, "docs/issues/01-a.md")
	s := settings.Defaults()
	s.RepoRoot = repo
	s.DocsRoots = []string{"."}
	if err := settings.Validate(s); err != nil {
		t.Fatal(err)
	}
	s.DocsRoots = []string{"../x"}
	if err := settings.Validate(s); err == nil {
		t.Fatal("a root outside the docs folder was accepted")
	}
	s.DocsDir = "."
	s.DocsRoots = []string{"."}
	if err := settings.Validate(s); err == nil {
		t.Fatal(`docsDir "." must still be refused`)
	}
}
