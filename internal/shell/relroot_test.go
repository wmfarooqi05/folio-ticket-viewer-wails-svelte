package shell

import (
	"path/filepath"
	"testing"
)

// A relative FOLIO_ROOT is taken against the working folder, not refused as "not a full path".
func TestFolioRootEnvMayBeRelative(t *testing.T) {
	repo := t.TempDir()
	mkdir(t, repo, "docs", "modules")
	t.Chdir(repo)
	t.Setenv(EnvRoot, ".")
	svc := New(filepath.Join(t.TempDir(), "settings.json"))
	if c, _ := svc.GetConfig(); c.RepoRoot != repo {
		t.Fatalf("repoRoot = %q, want %q", c.RepoRoot, repo)
	}
}
