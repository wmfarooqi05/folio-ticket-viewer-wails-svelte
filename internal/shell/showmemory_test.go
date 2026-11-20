package shell

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/settings"
)

// showMemory defaults to true, a patch can switch it off, and other saves do not undo it.
func TestShowMemorySettingDefaultsOnAndSurvives(t *testing.T) {
	t.Setenv(EnvRoot, "")
	path := filepath.Join(t.TempDir(), "settings.json")
	svc := New(path)
	if c, _ := svc.GetConfig(); !c.ShowMemory {
		t.Fatal("showMemory should default to true")
	}
	off := false
	if c, err := svc.SetConfig(ConfigPatch{ShowMemory: &off}); err != nil || c.ShowMemory {
		t.Fatalf("patch: %+v %v", c, err)
	}
	theme := settings.ThemeDark
	if _, err := svc.SetConfig(ConfigPatch{Theme: &theme}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetSidebarWidth(300); err != nil {
		t.Fatal(err)
	}
	if saved, _ := settings.Load(path); saved.ShowMemory {
		t.Fatal("showMemory came back on")
	}
	// a file from before this setting has no key: still on
	if err := os.WriteFile(path, []byte(`{"v":1,"theme":"dark"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if saved, _ := settings.Load(path); !saved.ShowMemory {
		t.Fatal("a missing key must keep the default (on)")
	}
}
