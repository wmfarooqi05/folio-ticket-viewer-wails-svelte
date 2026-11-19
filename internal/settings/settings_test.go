package settings

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func mkDocs(t *testing.T) string {
	t.Helper()
	repo := t.TempDir()
	if err := os.MkdirAll(filepath.Join(repo, "docs", "modules"), 0o755); err != nil {
		t.Fatal(err)
	}
	return repo
}

func hasField(err error, field string) bool {
	var ve ValidationError
	if !errors.As(err, &ve) {
		return false
	}
	for _, f := range ve {
		if f.Field == field {
			return true
		}
	}
	return false
}

func TestLoadMissingGivesDefaults(t *testing.T) {
	s, err := Load(filepath.Join(t.TempDir(), "nope.json"))
	if err != nil {
		t.Fatal(err)
	}
	if s.RepoRoot != "" || s.DocsDir != "docs" || s.Theme != ThemeSystem || len(s.DocsRoots) != 3 {
		t.Fatalf("unexpected defaults: %+v", s)
	}
}

func TestSaveLoadRoundTripKeepsUnknownKeys(t *testing.T) {
	path := filepath.Join(t.TempDir(), "Folio", "settings.json")
	s := Defaults()
	s.RepoRoot = mkDocs(t)
	s.Theme = ThemeDark
	s.Extra = map[string]json.RawMessage{"futureKey": json.RawMessage(`{"a":1}`)}
	if err := Save(path, s); err != nil {
		t.Fatal(err)
	}
	got, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if got.Theme != ThemeDark || got.RepoRoot != s.RepoRoot {
		t.Fatalf("round trip lost fields: %+v", got)
	}
	var compact bytes.Buffer
	_ = json.Compact(&compact, got.Extra["futureKey"])
	if compact.String() != `{"a":1}` {
		t.Fatalf("unknown key lost: %v", got.Extra)
	}
	if err := Save(path, got); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(path)
	if !strings.Contains(string(data), "futureKey") {
		t.Fatalf("unknown key not rewritten:\n%s", data)
	}
}

func TestSaveLeavesNoTempFiles(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "settings.json")
	for i := 0; i < 3; i++ {
		if err := Save(path, Defaults()); err != nil {
			t.Fatal(err)
		}
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Fatalf("expected only settings.json, got %v", entries)
	}
}

func TestLoadCorruptIsQuarantined(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")
	if err := os.WriteFile(path, []byte("{not json"), 0o644); err != nil {
		t.Fatal(err)
	}
	s, err := Load(path)
	if !errors.Is(err, ErrCorrupt) {
		t.Fatalf("want ErrCorrupt, got %v", err)
	}
	if s.RepoRoot != "" {
		t.Fatal("expected defaults")
	}
	if _, err := os.Stat(path + ".bad"); err != nil {
		t.Fatalf("bad file not kept: %v", err)
	}
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("corrupt file should have been moved")
	}
}

func TestValidate(t *testing.T) {
	repo := mkDocs(t)
	good := Defaults()
	good.RepoRoot = repo
	good.AdoWorkItemURL = "https://dev.azure.com/o/p/_workitems/edit/{id}"

	if err := Validate(Defaults()); err != nil {
		t.Fatalf("first-run defaults must validate: %v", err)
	}
	if err := Validate(good); err != nil {
		t.Fatalf("good settings rejected: %v", err)
	}

	cases := map[string]func(*Settings){
		"repoRoot":       func(s *Settings) { s.RepoRoot = filepath.Join(repo, "missing") },
		"docsRoots":      func(s *Settings) { s.DocsRoots = []string{"nothere"} },
		"adoWorkItemUrl": func(s *Settings) { s.AdoWorkItemURL = "http://x/{id}" },
		"adoPrUrl":       func(s *Settings) { s.AdoPRURL = "https://x/no-placeholder" },
		"theme":          func(s *Settings) { s.Theme = "neon" },
		"docsDir":        func(s *Settings) { s.DocsDir = ".." },
	}
	for field, mutate := range cases {
		s := good
		s.DocsRoots = append([]string(nil), good.DocsRoots...)
		mutate(&s)
		if err := Validate(s); !hasField(err, field) {
			t.Errorf("%s: expected a %s error, got %v", field, field, err)
		}
	}
}

func TestValidateRejectsEscapingRoots(t *testing.T) {
	s := Defaults()
	s.DocsRoots = []string{"../outside"}
	if Validate(s) == nil {
		t.Fatal("expected error for escaping docs root")
	}
}
