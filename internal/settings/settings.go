// Package settings owns Folio's own configuration file, settings.json.
//
// It writes only the app's config, never a ticket file, so the viewer stays
// read-only. See docs/issues/05-index-cache-refresh.md (D4) and
// docs/assets/05-index-cache-draft.md section 4.
package settings

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"
)

// Version is the settings.json schema version.
const Version = 1

// Theme values.
const (
	ThemeSystem = "system"
	ThemeLight  = "light"
	ThemeDark   = "dark"
)

// DefaultDocsDir is the docs folder inside the repo root.
const DefaultDocsDir = "docs"

// DefaultDocsRoots are the folders, relative to the docs dir, that Folio indexes.
var DefaultDocsRoots = []string{"modules", "handoffs", "patterns"}

// Window is the last window rectangle. Only Go writes it.
type Window struct {
	X         int  `json:"x"`
	Y         int  `json:"y"`
	Width     int  `json:"width"`
	Height    int  `json:"height"`
	Maximised bool `json:"maximised"`
}

// Settings is the content of settings.json.
type Settings struct {
	V              int      `json:"v"`
	RepoRoot       string   `json:"repoRoot"`
	DocsDir        string   `json:"docsDir"`
	DocsRoots      []string `json:"docsRoots"`
	AdoWorkItemURL string   `json:"adoWorkItemUrl"`
	AdoPRURL       string   `json:"adoPrUrl"`
	Theme          string   `json:"theme"`
	Window         Window   `json:"window"`

	// Extra holds keys this version does not know. They are written back unchanged.
	Extra map[string]json.RawMessage `json:"-"`
}

// Defaults returns the settings used when no file exists.
func Defaults() Settings {
	return Settings{
		V:         Version,
		DocsDir:   DefaultDocsDir,
		DocsRoots: slices.Clone(DefaultDocsRoots),
		Theme:     ThemeSystem,
		Window:    Window{Width: 1440, Height: 900},
	}
}

// DocsPath returns the absolute docs root (repoRoot/docsDir), or "" when no repo is set.
func (s Settings) DocsPath() string {
	if s.RepoRoot == "" {
		return ""
	}
	return filepath.Join(s.RepoRoot, filepath.FromSlash(s.DocsDir))
}

// Path returns the default settings file location, %APPDATA%\Folio\settings.json.
func Path() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "Folio", "settings.json"), nil
}

// ErrCorrupt is returned (wrapped) by Load when the file could not be parsed.
// The bad file has been renamed to settings.json.bad and defaults are returned.
var ErrCorrupt = errors.New("settings file is corrupt")

var knownKeys = []string{"v", "repoRoot", "docsDir", "docsRoots", "adoWorkItemUrl", "adoPrUrl", "theme", "window"}

// Load reads path. A missing file yields Defaults and no error. A corrupt file is
// renamed to <path>.bad, and Load returns Defaults with an error wrapping ErrCorrupt.
// Fields missing from the file keep their default values.
func Load(path string) (Settings, error) {
	s := Defaults()
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return s, nil
	}
	if err != nil {
		return s, err
	}
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))

	if err := json.Unmarshal(data, &s); err != nil {
		return Defaults(), quarantine(path, err)
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return Defaults(), quarantine(path, err)
	}
	for _, k := range knownKeys {
		delete(raw, k)
	}
	if len(raw) > 0 {
		s.Extra = raw
	}
	if s.V == 0 {
		s.V = Version
	}
	return s, nil
}

func quarantine(path string, cause error) error {
	bad := path + ".bad"
	if err := os.Rename(path, bad); err != nil {
		return fmt.Errorf("%w (%v); could not move it aside: %v", ErrCorrupt, cause, err)
	}
	return fmt.Errorf("%w (%v); moved to %s", ErrCorrupt, cause, bad)
}

// Marshal encodes s as indented JSON, with unknown keys merged back in.
func (s Settings) Marshal() ([]byte, error) {
	known, err := json.Marshal(s)
	if err != nil {
		return nil, err
	}
	var merged map[string]json.RawMessage
	if err := json.Unmarshal(known, &merged); err != nil {
		return nil, err
	}
	for k, v := range s.Extra {
		if _, taken := merged[k]; !taken {
			merged[k] = v
		}
	}
	return json.MarshalIndent(merged, "", "  ")
}

// Save writes s to path atomically: a temp file in the same directory, then a rename.
func Save(path string, s Settings) error {
	data, err := s.Marshal()
	if err != nil {
		return err
	}
	data = append(data, '\n')
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".settings-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	fail := func(err error) error {
		_ = tmp.Close()
		_ = os.Remove(tmpName)
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		return fail(err)
	}
	if err := tmp.Sync(); err != nil {
		return fail(err)
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpName)
		return err
	}
	if err := os.Rename(tmpName, path); err != nil {
		_ = os.Remove(tmpName)
		return err
	}
	return nil
}

// FieldError is one validation failure, keyed by the JSON field name so the UI
// can show it inline.
type FieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// ValidationError is the list of everything wrong with a Settings value.
type ValidationError []FieldError

func (v ValidationError) Error() string {
	parts := make([]string, len(v))
	for i, f := range v {
		parts[i] = f.Field + ": " + f.Message
	}
	return "invalid settings: " + strings.Join(parts, "; ")
}

// Validate checks s. An empty RepoRoot is valid (first run). Otherwise RepoRoot must
// be an existing directory and at least one docs root must exist beneath it.
func Validate(s Settings) error {
	var errs ValidationError
	add := func(field, msg string) { errs = append(errs, FieldError{field, msg}) }

	if !slices.Contains([]string{ThemeSystem, ThemeLight, ThemeDark}, s.Theme) {
		add("theme", "must be system, light or dark")
	}
	pathsOK := true
	if !isRelativeInside(s.DocsDir) {
		add("docsDir", "must be a relative folder inside the repo root")
		pathsOK = false
	}
	for _, r := range s.DocsRoots {
		if !isRelativeInside(r) {
			add("docsRoots", fmt.Sprintf("%q must be a relative folder inside the docs folder", r))
			pathsOK = false
		}
	}
	if err := validateURLTemplate(s.AdoWorkItemURL); err != nil {
		add("adoWorkItemUrl", err.Error())
	}
	if err := validateURLTemplate(s.AdoPRURL); err != nil {
		add("adoPrUrl", err.Error())
	}

	if s.RepoRoot != "" {
		if st, err := os.Stat(s.RepoRoot); err != nil || !st.IsDir() {
			add("repoRoot", "must be an existing folder")
		} else if pathsOK {
			docs := s.DocsPath()
			found := false
			for _, r := range s.DocsRoots {
				if st, err := os.Stat(filepath.Join(docs, filepath.FromSlash(r))); err == nil && st.IsDir() {
					found = true
					break
				}
			}
			if !found {
				add("docsRoots", "none of the docs roots exist under "+docs)
			}
		}
	}

	if len(errs) == 0 {
		return nil
	}
	return errs
}

// validateURLTemplate accepts "" or an https:// URL that contains {id}.
func validateURLTemplate(t string) error {
	if t == "" {
		return nil
	}
	if !strings.Contains(t, "{id}") {
		return errors.New("must contain {id}")
	}
	u, err := url.Parse(strings.ReplaceAll(t, "{id}", "0"))
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return errors.New("must be an https:// URL")
	}
	return nil
}

// isRelativeInside reports whether p is a non-empty relative path that stays inside its base.
func isRelativeInside(p string) bool {
	if p == "" || filepath.IsAbs(p) || filepath.VolumeName(p) != "" || strings.HasPrefix(p, "/") || strings.HasPrefix(p, "\\") {
		return false
	}
	clean := filepath.ToSlash(filepath.Clean(filepath.FromSlash(p)))
	return clean != "." && clean != ".." && !strings.HasPrefix(clean, "../")
}
