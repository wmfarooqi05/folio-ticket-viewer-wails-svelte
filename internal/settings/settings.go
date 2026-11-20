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
	"log"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
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

// WholeDocsRoot is the docs root that means "the whole docs folder" (ticket 25). The scope skips
// still apply under it: node_modules, dot folders and "_" folders.
const WholeDocsRoot = "."

// Window is the last window rectangle. Only Go writes it.
type Window struct {
	X         int  `json:"x"`
	Y         int  `json:"y"`
	Width     int  `json:"width"`
	Height    int  `json:"height"`
	Maximised bool `json:"maximised"`
}

// Sidebar width bounds in px. The frontend clamps to the same range (lib/resize.ts).
const (
	MinSidebarWidth = 200
	MaxSidebarWidth = 480
)

// ClampSidebarWidth limits w to the allowed range.
func ClampSidebarWidth(w int) int { return min(max(w, MinSidebarWidth), MaxSidebarWidth) }

// Side panel width bounds in px. The upper bound is only a sanity limit: the real
// maximum is 60% of the window, which only the frontend knows (lib/resize.ts).
const (
	MinPanelWidth = 320
	MaxPanelWidth = 4000
)

// ClampPanelWidth limits w to the allowed range.
func ClampPanelWidth(w int) int { return min(max(w, MinPanelWidth), MaxPanelWidth) }

// Settings is the content of settings.json.
type Settings struct {
	V              int      `json:"v"`
	RepoRoot       string   `json:"repoRoot"`
	DocsDir        string   `json:"docsDir"`
	DocsRoots      []string `json:"docsRoots"`
	AdoWorkItemURL string   `json:"adoWorkItemUrl"`
	AdoPRURL       string   `json:"adoPrUrl"`
	Theme          string   `json:"theme"`
	// ShowMemory shows the RAM readout in the sidebar footer. Off stops the polling.
	ShowMemory bool   `json:"showMemory"`
	Window     Window `json:"window"`

	// SidebarWidth is the tree's width in px. UI state, not a user setting: it sits
	// beside Window, is not in the Settings dialog and is not patchable through
	// SetConfig. 0 means the default.
	SidebarWidth int `json:"sidebarWidth"`
	// PanelWidth is the right side panel's width in px, same rules as SidebarWidth
	// (0 means the default, 360).
	PanelWidth int `json:"panelWidth"`
	// SidebarCollapsed is true when the user hid the tree. Same rules as SidebarWidth.
	SidebarCollapsed bool `json:"sidebarCollapsed"`

	// Extra holds keys this version does not know. They are written back unchanged.
	Extra map[string]json.RawMessage `json:"-"`
}

// Defaults returns the settings used when no file exists.
func Defaults() Settings {
	return Settings{
		V:          Version,
		DocsDir:    DefaultDocsDir,
		DocsRoots:  slices.Clone(DefaultDocsRoots),
		Theme:      ThemeSystem,
		ShowMemory: false, // L1: process enumeration can trip endpoint security, so it is opt-in
		Window:     Window{Width: 1440, Height: 900},
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

var knownKeys = []string{"v", "repoRoot", "docsDir", "docsRoots", "adoWorkItemUrl", "adoPrUrl", "theme", "showMemory", "window", "sidebarWidth", "panelWidth", "sidebarCollapsed"}

// Load reads path. A missing file yields Defaults and no error. A file that is not a JSON
// object is renamed to <path>.bad, and Load returns Defaults with an error wrapping ErrCorrupt.
// Fields missing from the file keep their default values, and so does any field that is
// rejected (a wrong type, or a value Validate would refuse, L2): the rest of the file is kept
// and what was rejected is logged.
func Load(path string) (Settings, error) {
	s, rejected, err := LoadReport(path)
	for _, r := range rejected {
		log.Printf("settings: %s: %s: %s; using the default", path, r.Field, r.Message)
	}
	return s, err
}

// LoadReport is Load without the logging: it also returns what was rejected, field by field.
func LoadReport(path string) (Settings, []FieldError, error) {
	s := Defaults()
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return s, nil, nil
	}
	if err != nil {
		return s, nil, err
	}
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil || raw == nil {
		if err == nil {
			err = errors.New("not a JSON object")
		}
		return Defaults(), nil, quarantine(path, err)
	}
	var rejected []FieldError
	reject := func(field, msg string) { rejected = append(rejected, FieldError{field, msg}) }
	// get decodes src[key] into dst. A missing or null key is skipped; a wrong type is rejected.
	get := func(src map[string]json.RawMessage, field, key string, dst any) bool {
		rm, ok := src[key]
		if !ok || string(bytes.TrimSpace(rm)) == "null" {
			return false
		}
		if err := json.Unmarshal(rm, dst); err != nil {
			reject(field, "wrong type")
			return false
		}
		return true
	}
	var str string
	for _, f := range []struct {
		key string
		dst *string
	}{{"repoRoot", &s.RepoRoot}, {"docsDir", &s.DocsDir}, {"adoWorkItemUrl", &s.AdoWorkItemURL}, {"adoPrUrl", &s.AdoPRURL}, {"theme", &s.Theme}} {
		if get(raw, f.key, f.key, &str) {
			*f.dst = str
		}
	}
	var n int
	// Whole numbers only, and only those a JavaScript number holds exactly (the Node backend's rule):
	// 1e3 and 1.0 already fail to decode into an int; this adds the range.
	const maxSafe = 1<<53 - 1
	for _, f := range []struct {
		key string
		dst *int
	}{{"v", &s.V}, {"sidebarWidth", &s.SidebarWidth}, {"panelWidth", &s.PanelWidth}} {
		if get(raw, f.key, f.key, &n) {
			if n > maxSafe || n < -maxSafe {
				reject(f.key, "wrong type")
				continue
			}
			*f.dst = n
		}
	}
	var b bool
	if get(raw, "showMemory", "showMemory", &b) {
		s.ShowMemory = b
	}
	if get(raw, "sidebarCollapsed", "sidebarCollapsed", &b) {
		s.SidebarCollapsed = b
	}
	var roots []string
	if get(raw, "docsRoots", "docsRoots", &roots) {
		s.DocsRoots = roots
	}
	var win map[string]json.RawMessage
	if get(raw, "window", "window", &win) {
		for _, f := range []struct {
			key string
			dst *int
		}{{"x", &s.Window.X}, {"y", &s.Window.Y}, {"width", &s.Window.Width}, {"height", &s.Window.Height}} {
			if get(win, "window."+f.key, f.key, &n) {
				if n > maxSafe || n < -maxSafe {
					reject("window."+f.key, "wrong type")
					continue
				}
				*f.dst = n
			}
		}
		if get(win, "window.maximised", "maximised", &b) {
			s.Window.Maximised = b
		}
	}

	// Values of the right type that Validate would refuse. repoRoot is checked for its shape only
	// (a network or device path); whether it exists is the first-run screen's business.
	d := Defaults()
	if !slices.Contains([]string{ThemeSystem, ThemeLight, ThemeDark}, s.Theme) {
		reject("theme", "must be system, light or dark")
		s.Theme = d.Theme
	}
	if !isRelativeInside(s.DocsDir) {
		reject("docsDir", "must be a relative folder inside the repo root")
		s.DocsDir = d.DocsDir
	}
	if msg := rootsError(s.DocsRoots); msg != "" {
		reject("docsRoots", msg)
		s.DocsRoots = d.DocsRoots
	}
	if err := validateURLTemplate(s.AdoWorkItemURL); err != nil {
		reject("adoWorkItemUrl", err.Error())
		s.AdoWorkItemURL = ""
	}
	if err := validateURLTemplate(s.AdoPRURL); err != nil {
		reject("adoPrUrl", err.Error())
		s.AdoPRURL = ""
	}
	if msg := RootShapeError(s.RepoRoot, nil); msg != "" {
		reject("repoRoot", msg)
		s.RepoRoot = ""
	}
	if s.SidebarWidth != 0 && ClampSidebarWidth(s.SidebarWidth) != s.SidebarWidth {
		reject("sidebarWidth", "out of range")
		s.SidebarWidth = ClampSidebarWidth(s.SidebarWidth)
	}
	if s.PanelWidth != 0 && ClampPanelWidth(s.PanelWidth) != s.PanelWidth {
		reject("panelWidth", "out of range")
		s.PanelWidth = ClampPanelWidth(s.PanelWidth)
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
	return s, rejected, nil
}

// rootsError is "" when there is at least one docs root and each is a relative folder inside the docs folder.
func rootsError(roots []string) string {
	if len(roots) == 0 {
		return "must list at least one folder"
	}
	for _, r := range roots {
		if !IsRootInside(r) {
			return fmt.Sprintf("%q must be a relative folder inside the docs folder", r)
		}
	}
	return ""
}

// NetworkRootMessage is what a rejected network or device repo root says. Both backends use it.
const NetworkRootMessage = `network and device paths (\\server\share, \\?\, \\.\) are not allowed as the repo root`

// LocalRootMessage is what a repo root that is not a full local path says (Windows only).
const LocalRootMessage = `the repo root must be a full path that starts with a drive letter, such as C:\repo`

var driveRoot = regexp.MustCompile(`^[A-Za-z]:[\\/]`)

// RootShapeError is "" when p can be a repo root, and otherwise the message to show. An allow-list
// on Windows: a full path with a drive letter, or a network folder in allowNetwork (the one picked
// in the native dialog). A relative, root-relative (\foo) or drive-relative (C:foo) path would
// resolve against whatever folder Folio happens to run in, and a UNC or device path is SMB.
// Everywhere else only the network check applies. "" is fine (first run).
func RootShapeError(p string, allowNetwork []string) string {
	switch {
	case p == "":
		return ""
	case IsNetworkPath(p):
		if InPaths(allowNetwork, p) {
			return ""
		}
		return NetworkRootMessage
	case runtime.GOOS == "windows" && !driveRoot.MatchString(p):
		return LocalRootMessage
	}
	return ""
}

// IsNetworkLinkTarget reports whether the target of a symlink is a network or device path other
// than a local drive written as a device path (\\?\C:\...). Reading through such a link is SMB.
func IsNetworkLinkTarget(t string) bool {
	if !IsNetworkPath(t) {
		return false
	}
	return !localDeviceTarget.MatchString(t)
}

// localDeviceTarget matches the device-path forms that are local: a drive (\\?\C:\...) and a volume
// mount point, which Windows reads back as \\?\Volume{GUID}\ (also with the \??\ prefix).
var localDeviceTarget = regexp.MustCompile(`(?i)^(?:[\\/]{2}[?.][\\/]|\\\?\?\\)(?:[A-Za-z]:(?:[\\/]|$)|Volume\{[0-9a-f-]+\}(?:[\\/]|$))`)

// IsNetworkPath reports whether p is a UNC path (\\host\share) or a device path (\\?\, \\.\, \??\).
// Opening one makes Windows talk SMB with the user's credentials, so it is never used as a root
// unless the user picked it in the native folder dialog (L2). Either slash counts, as on Windows.
func IsNetworkPath(p string) bool {
	slash := func(c byte) bool { return c == '\\' || c == '/' }
	if len(p) >= 2 && slash(p[0]) && slash(p[1]) {
		return true
	}
	return strings.HasPrefix(p, `\??\`)
}

// InPaths reports whether p is one of list, compared as SamePath does.
func InPaths(list []string, p string) bool {
	for _, q := range list {
		if SamePath(q, p) {
			return true
		}
	}
	return false
}

// SamePath compares two paths the way Windows does: cleaned, and without regard to case.
func SamePath(a, b string) bool {
	return a != "" && b != "" && strings.EqualFold(filepath.Clean(a), filepath.Clean(b))
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
func Validate(s Settings) error { return ValidateAllowing(s, nil) }

// ValidateAllowing is Validate, except that a network or device repo root equal to one of
// allowNetwork is accepted. The caller passes the folders the user picked in the native dialog,
// a fact only Go knows (see shell.ShellService); none allows none.
func ValidateAllowing(s Settings, allowNetwork []string) error {
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
		if !IsRootInside(r) {
			add("docsRoots", fmt.Sprintf("%q must be a relative folder inside the docs folder", r))
			pathsOK = false
		}
	}
	rootMsg := RootShapeError(s.RepoRoot, allowNetwork)
	if err := validateURLTemplate(s.AdoWorkItemURL); err != nil {
		add("adoWorkItemUrl", err.Error())
	}
	if err := validateURLTemplate(s.AdoPRURL); err != nil {
		add("adoPrUrl", err.Error())
	}

	if rootMsg != "" {
		// Checked before any file-system call: even a stat on a UNC path starts SMB.
		add("repoRoot", rootMsg)
	} else if s.RepoRoot != "" {
		if !SafeIsDir(s.RepoRoot) {
			add("repoRoot", "must be an existing folder")
		} else if pathsOK {
			docs := s.DocsPath()
			found := false
			for _, r := range s.DocsRoots {
				if SafeIsDir(filepath.Join(docs, filepath.FromSlash(r))) {
					found = true
					break
				}
			}
			if !found {
				add("docsRoots", "none of the selected folders exist under "+docs)
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

// IsRelativeInside is the exported form of isRelativeInside, for the shell service.
func IsRelativeInside(p string) bool { return isRelativeInside(p) }

// IsRootInside is IsRelativeInside for a docs root: "." (the whole docs folder) is allowed too.
func IsRootInside(p string) bool { return IsWholeRoot(p) || isRelativeInside(p) }

// IsWholeRoot reports whether p is a relative path that names the base folder itself: ".", "./", "a/..".
func IsWholeRoot(p string) bool {
	return relativeShape(p) && filepath.ToSlash(filepath.Clean(filepath.FromSlash(p))) == "."
}

func relativeShape(p string) bool {
	return p != "" && !filepath.IsAbs(p) && filepath.VolumeName(p) == "" && !strings.HasPrefix(p, "/") && !strings.HasPrefix(p, "\\")
}

// isRelativeInside reports whether p is a non-empty relative path that stays inside its base.
func isRelativeInside(p string) bool {
	if !relativeShape(p) {
		return false
	}
	clean := filepath.ToSlash(filepath.Clean(filepath.FromSlash(p)))
	return clean != "." && clean != ".." && !strings.HasPrefix(clean, "../")
}
