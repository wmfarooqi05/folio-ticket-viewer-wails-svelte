package settings

import (
	"os"
	"path/filepath"
	"slices"
	"testing"
)

// AC1 (ticket 18, L2): a hand-edited settings.json is corrected field by field on load.
func TestLoadRejectsBadFieldsOneByOne(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")
	hand := `{
	  "v": 1,
	  "theme": "blue",
	  "docsDir": "../x",
	  "docsRoots": ["modules", "../.."],
	  "adoWorkItemUrl": "http://x.example.com/{id}",
	  "adoPrUrl": "https://ok.example.com/{id}",
	  "repoRoot": "\\\\host\\share\\repo",
	  "showMemory": "yes",
	  "sidebarWidth": 5000,
	  "panelWidth": "wide",
	  "window": {"width": "big", "height": 700},
	  "zzz": [1]
	}`
	if err := os.WriteFile(path, []byte(hand), 0o644); err != nil {
		t.Fatal(err)
	}
	s, rejected, err := LoadReport(path)
	if err != nil {
		t.Fatalf("a mistyped field must not quarantine the file: %v", err)
	}
	if _, err := os.Stat(path + ".bad"); err == nil {
		t.Fatal("file was moved aside")
	}
	d := Defaults()
	if s.Theme != d.Theme || s.DocsDir != d.DocsDir || !slices.Equal(s.DocsRoots, d.DocsRoots) {
		t.Fatalf("theme, docsDir and docsRoots should be the defaults: %+v", s)
	}
	if s.AdoWorkItemURL != "" || s.AdoPRURL != "https://ok.example.com/{id}" {
		t.Fatalf("the http template goes, the https one stays: %q %q", s.AdoWorkItemURL, s.AdoPRURL)
	}
	if s.RepoRoot != "" {
		t.Fatalf("UNC root kept: %q", s.RepoRoot)
	}
	if s.ShowMemory || s.SidebarWidth != MaxSidebarWidth || s.PanelWidth != 0 {
		t.Fatalf("showMemory/sidebarWidth/panelWidth: %+v", s)
	}
	if s.Window.Width != d.Window.Width || s.Window.Height != 700 {
		t.Fatalf("window: %+v", s.Window)
	}
	if _, ok := s.Extra["zzz"]; !ok {
		t.Fatal("unknown key lost")
	}
	var fields []string
	for _, r := range rejected {
		fields = append(fields, r.Field)
	}
	slices.Sort(fields)
	want := []string{"adoWorkItemUrl", "docsDir", "docsRoots", "repoRoot", "showMemory", "sidebarWidth", "theme", "window.width", "panelWidth"}
	slices.Sort(want)
	if !slices.Equal(fields, want) {
		t.Fatalf("rejected %v, want %v", fields, want)
	}
	// What Load returns is what Validate would accept (no repo root yet).
	if err := Validate(s); err != nil {
		t.Fatalf("loaded settings do not validate: %v", err)
	}
}

func TestLoadNonObjectIsCorrupt(t *testing.T) {
	for _, text := range []string{"[1]", "null", "7", "{ nope"} {
		path := filepath.Join(t.TempDir(), "settings.json")
		if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
		if _, err := Load(path); err == nil {
			t.Errorf("%q: want ErrCorrupt", text)
		}
		if _, err := os.Stat(path + ".bad"); err != nil {
			t.Errorf("%q: not moved aside", text)
		}
	}
}

func TestIsNetworkPath(t *testing.T) {
	for _, p := range []string{`\\host\share`, `//host/share`, `\\?\C:\x`, `\\.\C:\x`, `\??\C:\x`, `\/host/share`} {
		if !IsNetworkPath(p) {
			t.Errorf("%q should be a network or device path", p)
		}
	}
	for _, p := range []string{`C:\repo`, `C:/repo`, `/home/me`, `repo`, `\one`, ``} {
		if IsNetworkPath(p) {
			t.Errorf("%q should be a local path", p)
		}
	}
}

func TestValidateRefusesNetworkRootUnlessAllowed(t *testing.T) {
	s := Defaults()
	s.RepoRoot = `\\folio-no-such-host\share\repo`
	err := Validate(s)
	if !hasField(err, "repoRoot") {
		t.Fatalf("want a repoRoot error, got %v", err)
	}
	if got := ValidateAllowing(s, []string{`\\other\share`}); !hasField(got, "repoRoot") {
		t.Fatalf("another allowed folder must not help: %v", got)
	}
	// Allowed: the check passes the network test, and only then looks at the disk (which fails
	// here, for the missing host, with the ordinary message instead of the network one).
	got := ValidateAllowing(s, []string{s.RepoRoot})
	if !hasField(got, "repoRoot") || got.Error() == err.Error() {
		t.Fatalf("an allowed root should reach the existence check: %v", got)
	}
}

func TestShowMemoryIsOffByDefault(t *testing.T) {
	if Defaults().ShowMemory {
		t.Fatal("L1: the RAM readout must be off by default")
	}
}
