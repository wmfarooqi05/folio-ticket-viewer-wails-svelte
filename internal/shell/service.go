// Package shell is the app-level Wails service: config, native dialogs and links
// (docs/issues/05-index-cache-refresh.md, D1, D4, D5).
package shell

import (
	"errors"
	"log"
	"os"
	"path/filepath"
	"slices"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/docs"
	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/settings"
)

// EnvRoot is the dev override: a path to a docs folder (or a repo root) that skips
// the first-run picker. It is applied in memory only and never written to disk.
const EnvRoot = "FOLIO_ROOT"

// Config is what the frontend sees.
type Config = settings.Settings

// ConfigPatch updates a Config. Pointer fields keep the TS fields optional, so a
// patch cannot overwrite what it does not mention. The window bounds are not
// patchable: Go alone writes them.
type ConfigPatch struct {
	RepoRoot       *string   `json:"repoRoot,omitempty"`
	DocsDir        *string   `json:"docsDir,omitempty"`
	DocsRoots      *[]string `json:"docsRoots,omitempty"`
	AdoWorkItemURL *string   `json:"adoWorkItemUrl,omitempty"`
	AdoPRURL       *string   `json:"adoPrUrl,omitempty"`
	Theme          *string   `json:"theme,omitempty"`
}

// RootCheck reports what CheckRoot found in a folder the user picked.
type RootCheck struct {
	OK       bool     `json:"ok"`
	RepoRoot string   `json:"repoRoot"` // set when OK
	DocsDir  string   `json:"docsDir"`  // set when OK
	Found    []string `json:"found"`    // docs roots that exist
	Missing  []string `json:"missing"`  // docs roots that do not
	Message  string   `json:"message"`  // for the inline error when !OK
}

// ShellService is registered with Wails.
type ShellService struct {
	path string // settings.json

	mu       sync.Mutex
	saved    settings.Settings // what is on disk (or defaults)
	override *RootCheck        // FOLIO_ROOT, applied on top of saved, never persisted
}

// New loads settings from path and applies the FOLIO_ROOT override if set.
func New(path string) *ShellService {
	s := &ShellService{path: path}
	cfg, err := settings.Load(path)
	if err != nil {
		// A corrupt file was moved aside; the first-run screen follows. Never overwritten.
		log.Printf("shell: %v", err)
	}
	s.saved = cfg
	if env := os.Getenv(EnvRoot); env != "" {
		if rc := InspectRoot(env, cfg.DocsRoots); rc.OK {
			s.override = &rc
			log.Printf("shell: %s=%s -> repoRoot=%s docsDir=%s", EnvRoot, env, rc.RepoRoot, rc.DocsDir)
		} else {
			log.Printf("shell: %s=%s ignored: %s", EnvRoot, env, rc.Message)
		}
	}
	return s
}

// effective returns saved settings with the dev override applied. Caller holds mu.
func (s *ShellService) effective() settings.Settings {
	cfg := s.saved
	if s.override != nil {
		cfg.RepoRoot = s.override.RepoRoot
		cfg.DocsDir = s.override.DocsDir
	}
	return cfg
}

// RootsOf is what DocsService reads on every call. It is a function, not a method,
// so it is not exposed to the frontend.
func RootsOf(s *ShellService) docs.Roots {
	s.mu.Lock()
	defer s.mu.Unlock()
	cfg := s.effective()
	return docs.Roots{Docs: cfg.DocsPath(), Roots: slices.Clone(cfg.DocsRoots)}
}

// GetConfig returns the current config. repoRoot is "" on first run.
func (s *ShellService) GetConfig() (Config, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.effective(), nil
}

// SetConfig applies the patch, validates, saves atomically and returns the new config.
// The FOLIO_ROOT override is not persisted: the patch is applied to the saved settings.
func (s *ShellService) SetConfig(p ConfigPatch) (Config, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	// Pick up edits made to settings.json by hand ("Open settings file"), so a save
	// does not overwrite them. The window bounds stay Go's in-memory copy. A missing
	// or unreadable file keeps what is in memory.
	base := s.saved
	if _, err := os.Stat(s.path); err == nil {
		if disk, err := settings.Load(s.path); err == nil {
			disk.Window = s.saved.Window
			disk.SidebarWidth = s.saved.SidebarWidth
			disk.PanelWidth = s.saved.PanelWidth
			disk.SidebarCollapsed = s.saved.SidebarCollapsed
			base = disk
		}
	}
	next := base
	next.DocsRoots = slices.Clone(base.DocsRoots)
	if p.RepoRoot != nil {
		next.RepoRoot = *p.RepoRoot
	}
	if p.DocsDir != nil {
		next.DocsDir = *p.DocsDir
	}
	if p.DocsRoots != nil {
		next.DocsRoots = slices.Clone(*p.DocsRoots)
	}
	if p.AdoWorkItemURL != nil {
		next.AdoWorkItemURL = *p.AdoWorkItemURL
	}
	if p.AdoPRURL != nil {
		next.AdoPRURL = *p.AdoPRURL
	}
	if p.Theme != nil {
		next.Theme = *p.Theme
	}
	if err := settings.Validate(next); err != nil {
		return Config{}, err
	}
	if err := settings.Save(s.path, next); err != nil {
		return Config{}, err
	}
	s.saved = next
	return s.effective(), nil
}

// updateUI changes one piece of UI state in settings.json. It reloads the file first
// so hand edits survive, applies only `change`, and saves. A missing file is created;
// a corrupt one is left alone. Caller holds mu.
func (s *ShellService) updateUI(change func(*settings.Settings)) error {
	base := s.saved
	if _, err := os.Stat(s.path); err == nil {
		disk, err := settings.Load(s.path) // a corrupt file is quarantined and yields defaults
		if err != nil {
			return err
		}
		disk.Window = s.saved.Window
		base = disk
	}
	change(&base)
	if err := settings.Save(s.path, base); err != nil {
		return err
	}
	s.saved = base
	return nil
}

// SetSidebarWidth saves the tree width (UI state, called once when a drag ends). It
// changes only that field and clamps the value.
func (s *ShellService) SetSidebarWidth(width int) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	w := settings.ClampSidebarWidth(width)
	if err := s.updateUI(func(c *settings.Settings) { c.SidebarWidth = w }); err != nil {
		return 0, err
	}
	return w, nil
}

// SetPanelWidth saves the side panel width (called once when a drag ends), the same
// way as SetSidebarWidth.
func (s *ShellService) SetPanelWidth(width int) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	w := settings.ClampPanelWidth(width)
	if err := s.updateUI(func(c *settings.Settings) { c.PanelWidth = w }); err != nil {
		return 0, err
	}
	return w, nil
}

// SetSidebarCollapsed saves whether the tree is hidden, the same way as SetSidebarWidth.
func (s *ShellService) SetSidebarCollapsed(collapsed bool) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.updateUI(func(c *settings.Settings) { c.SidebarCollapsed = collapsed }); err != nil {
		return false, err
	}
	return collapsed, nil
}

// PickFolder opens the native folder dialog. "" means cancelled.
func (s *ShellService) PickFolder() (string, error) {
	return application.Get().Dialog.OpenFile().
		CanChooseDirectories(true).
		CanChooseFiles(false).
		SetTitle("Choose the ticket repo (or its docs folder)").
		PromptForSingleSelection()
}

// CheckRoot inspects a folder the user picked (first run, 05 draft section 4). It
// accepts a repo root that contains docs/<root>, or the docs folder itself, in which
// case repoRoot becomes the parent and docsDir the folder name.
func (s *ShellService) CheckRoot(abs string) (RootCheck, error) {
	s.mu.Lock()
	roots := slices.Clone(s.saved.DocsRoots)
	s.mu.Unlock()
	return InspectRoot(abs, roots), nil
}

// InspectRoot is the pure part of ShellService.CheckRoot.
func InspectRoot(abs string, roots []string) RootCheck {
	if len(roots) == 0 {
		roots = settings.DefaultDocsRoots
	}
	fail := RootCheck{Found: []string{}, Missing: slices.Clone(roots),
		Message: "expects " + joinRoots(roots) + " inside the folder"}
	if st, err := os.Stat(abs); err != nil || !st.IsDir() {
		fail.Message = "that is not a folder"
		return fail
	}
	abs = filepath.Clean(abs)

	// A repo root: abs/docs/<root>.
	if found, missing := probe(filepath.Join(abs, settings.DefaultDocsDir), roots); len(found) > 0 {
		return RootCheck{OK: true, RepoRoot: abs, DocsDir: settings.DefaultDocsDir, Found: found, Missing: missing}
	}
	// The docs folder itself: abs/<root>.
	if found, missing := probe(abs, roots); len(found) > 0 {
		return RootCheck{OK: true, RepoRoot: filepath.Dir(abs), DocsDir: filepath.Base(abs), Found: found, Missing: missing}
	}
	return fail
}

func probe(dir string, roots []string) (found, missing []string) {
	found, missing = []string{}, []string{}
	for _, r := range roots {
		if st, err := os.Stat(filepath.Join(dir, filepath.FromSlash(r))); err == nil && st.IsDir() {
			found = append(found, r)
		} else {
			missing = append(missing, r)
		}
	}
	return found, missing
}

func joinRoots(roots []string) string {
	out := ""
	for i, r := range roots {
		if i > 0 {
			out += " · "
		}
		out += r + "/"
	}
	return out
}

// OpenInVSCode opens a ticket file (path relative to the docs root) at a line, through
// the vscode:// protocol handler. Line 0 means the top. It needs no `code` binary.
func (s *ShellService) OpenInVSCode(path string, line int) error {
	s.mu.Lock()
	docsRoot := s.effective().DocsPath()
	s.mu.Unlock()
	full, err := docs.ResolveMarkdown(docsRoot, path)
	if err != nil {
		return err
	}
	abs, err := filepath.Abs(full)
	if err != nil {
		return err
	}
	return application.Get().Browser.OpenURL(VSCodeURL(abs, line))
}

// OpenExternal opens an http(s) link in the default browser. Anything else is
// rejected (see ValidateExternalURL), so a ticket cannot make Folio launch a
// file:, javascript: or custom-protocol handler.
func (s *ShellService) OpenExternal(url string) error {
	clean, err := ValidateExternalURL(url)
	if err != nil {
		return err
	}
	return application.Get().Browser.OpenURL(clean)
}

// OpenSettingsFile opens settings.json in VS Code (the same vscode:// route as
// OpenInVSCode, but for the app's own config, which is outside the docs root).
// The file is created with the current settings first if it does not exist yet.
func (s *ShellService) OpenSettingsFile() error {
	s.mu.Lock()
	path, saved := s.path, s.saved
	s.mu.Unlock()
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		if err := settings.Save(path, saved); err != nil {
			return err
		}
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	return application.Get().Browser.OpenURL(VSCodeURL(abs, 0))
}

// CheckDocs reports which of roots exist under repoRoot/docsDir, for the settings
// dialog's chips. It changes nothing.
func (s *ShellService) CheckDocs(repoRoot, docsDir string, roots []string) (RootCheck, error) {
	return InspectDocs(repoRoot, docsDir, roots), nil
}

// InspectDocs is the pure part of ShellService.CheckDocs. OK means at least one
// root exists.
func InspectDocs(repoRoot, docsDir string, roots []string) RootCheck {
	if len(roots) == 0 {
		roots = settings.DefaultDocsRoots
	}
	rc := RootCheck{Found: []string{}, Missing: slices.Clone(roots), RepoRoot: repoRoot, DocsDir: docsDir}
	if st, err := os.Stat(repoRoot); err != nil || !st.IsDir() {
		rc.Message = "that is not a folder"
		return rc
	}
	if docsDir == "" {
		docsDir = settings.DefaultDocsDir
	}
	if !settings.IsRelativeInside(docsDir) {
		rc.Message = "the docs folder must be inside the repo root"
		return rc
	}
	for _, r := range roots {
		if !settings.IsRelativeInside(r) {
			rc.Message = "the docs roots must be folders inside the docs folder"
			return rc
		}
	}
	rc.Found, rc.Missing = probe(filepath.Join(repoRoot, filepath.FromSlash(docsDir)), roots)
	rc.OK = len(rc.Found) > 0
	if !rc.OK {
		rc.Message = "expects " + joinRoots(roots) + " inside the folder"
	}
	return rc
}
