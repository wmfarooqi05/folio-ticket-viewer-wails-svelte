package shell

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/settings"
)

// showMemory defaults to off (ticket 18, L1), a patch can switch it on, and other saves do not undo it.
func TestShowMemorySettingDefaultsOffAndSurvives(t *testing.T) {
	t.Setenv(EnvRoot, "")
	path := filepath.Join(t.TempDir(), "settings.json")
	svc := New(path)
	if c, _ := svc.GetConfig(); c.ShowMemory {
		t.Fatal("showMemory should default to false")
	}
	on := true
	if c, err := svc.SetConfig(ConfigPatch{ShowMemory: &on}); err != nil || !c.ShowMemory {
		t.Fatalf("patch: %+v %v", c, err)
	}
	theme := settings.ThemeDark
	if _, err := svc.SetConfig(ConfigPatch{Theme: &theme}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetSidebarWidth(300); err != nil {
		t.Fatal(err)
	}
	if saved, _ := settings.Load(path); !saved.ShowMemory {
		t.Fatal("showMemory went back off")
	}
	// a file from before this setting has no key: off
	if err := os.WriteFile(path, []byte(`{"v":1,"theme":"dark"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if saved, _ := settings.Load(path); saved.ShowMemory {
		t.Fatal("a missing key must give the default (off)")
	}
}
