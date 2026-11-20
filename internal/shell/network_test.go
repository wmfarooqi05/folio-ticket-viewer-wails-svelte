package shell

import (
	"path/filepath"
	"testing"

	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/settings"
)

// The explicit-pick exception for network and device repo roots (ticket 18, L2).
//
// A device path with a drive letter (\\?\C:\...) is a "network or device path" to Folio but a plain
// local folder to Windows, so these tests exercise the allowed path with no network involved.
func TestNetworkRootOnlyAfterANativePick(t *testing.T) {
	t.Setenv(EnvRoot, "")
	repo := t.TempDir()
	mkdir(t, repo, "docs", "modules")
	dev := `\\?\` + repo
	svc := New(filepath.Join(t.TempDir(), "settings.json"))

	// Without a pick (what page script can do) everything refuses, with the plain message.
	if rc, _ := svc.CheckRoot(dev); rc.OK || rc.Message != settings.NetworkRootMessage {
		t.Fatalf("CheckRoot before a pick: %+v", rc)
	}
	if rc, _ := svc.CheckDocs(dev, "docs", nil); rc.OK || rc.Message != settings.NetworkRootMessage {
		t.Fatalf("CheckDocs before a pick: %+v", rc)
	}
	if _, err := svc.SetConfig(ConfigPatch{RepoRoot: &dev}); err == nil {
		t.Fatal("SetConfig took a network root nobody picked")
	}
	if c, _ := svc.GetConfig(); c.RepoRoot != "" {
		t.Fatalf("config changed: %+v", c)
	}

	// The native dialog returned it: Go remembers, then CheckRoot, CheckDocs and SetConfig agree.
	svc.notePick(dev)
	rc, _ := svc.CheckRoot(dev)
	if !rc.OK || rc.RepoRoot != dev {
		t.Fatalf("CheckRoot after a pick: %+v", rc)
	}
	if rc, _ := svc.CheckDocs(dev, "docs", nil); !rc.OK {
		t.Fatalf("CheckDocs after a pick: %+v", rc)
	}
	if _, err := svc.SetConfig(ConfigPatch{RepoRoot: &dev}); err != nil {
		t.Fatalf("SetConfig after a pick: %v", err)
	}

	// A later save of something else keeps the root, even though a reload of the file rejects it.
	theme := settings.ThemeDark
	if c, err := svc.SetConfig(ConfigPatch{Theme: &theme}); err != nil || c.RepoRoot != dev {
		t.Fatalf("theme save lost the root: %+v %v", c, err)
	}
	if _, err := svc.SetSidebarWidth(300); err != nil {
		t.Fatal(err)
	}
	if c, _ := svc.GetConfig(); c.RepoRoot != dev {
		t.Fatalf("UI-state save lost the root: %+v", c)
	}

	// A different network folder is still refused.
	other := `\\?\` + filepath.Join(repo, "docs")
	if rc, _ := svc.CheckRoot(other); rc.OK {
		t.Fatalf("a path nobody picked was accepted: %+v", rc)
	}

	// The next launch rejects it again, whatever the file says: the exception is not persisted.
	next := New(svc.path)
	if c, _ := next.GetConfig(); c.RepoRoot != "" {
		t.Fatalf("a network root survived a restart: %q", c.RepoRoot)
	}
}

func TestFolioRootEnvRefusesNetworkPath(t *testing.T) {
	t.Setenv(EnvRoot, `\\folio-no-such-host\share\repo`)
	svc := New(filepath.Join(t.TempDir(), "settings.json"))
	if c, _ := svc.GetConfig(); c.RepoRoot != "" {
		t.Fatalf("FOLIO_ROOT override took a UNC path: %q", c.RepoRoot)
	}
}
