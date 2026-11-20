// Package localdata is "Clear data" (ticket 18, L5): it removes what Folio keeps on this machine
// apart from settings.json, which is the index cache and the WebView2 profile.
//
// The cache can go at once. A running WebView2 locks its profile folder, so the profile is deleted
// at the next start instead: ClearData leaves a marker file, and RunPending, called first thing in
// main before any WebView2 exists, does the deleting.
//
// Nothing outside Folio's own folders is ever deleted. The folders are computed here from the
// environment, never taken from a marker, the frontend or a settings file, and each one is checked
// again by removeGuarded before it is touched.
package localdata

import (
	"errors"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/docs"
)

// MarkerName is the file, in %LOCALAPPDATA%\Folio, that asks the next start to delete the profile.
const MarkerName = "purge-profile.pending"

// Paths holds the three environment facts everything else is computed from, so tests can point
// them at a temp folder.
type Paths struct {
	LocalAppData string // %LOCALAPPDATA%
	AppData      string // %APPDATA%
	ExeName      string // base name of the running exe, e.g. folio.exe
}

// Default reads the environment and the running exe's name.
func Default() Paths {
	exe, _ := os.Executable()
	return Paths{LocalAppData: os.Getenv("LOCALAPPDATA"), AppData: os.Getenv("APPDATA"), ExeName: filepath.Base(exe)}
}

// FolioDir is %LOCALAPPDATA%\Folio, where the marker lives, beside the cache and (from ticket 16) the profile.
func (p Paths) FolioDir() string {
	if p.LocalAppData == "" {
		return ""
	}
	return filepath.Join(p.LocalAppData, "Folio")
}

// ProfileDirs lists the places a WebView2 profile of Folio can be: the folder ticket 16 gives it,
// and the Wails default that older builds still use, %APPDATA%\<exe name>.
func (p Paths) ProfileDirs() []string {
	var out []string
	if d := p.FolioDir(); d != "" {
		out = append(out, filepath.Join(d, "WebView2"))
	}
	if p.AppData != "" && strings.HasSuffix(strings.ToLower(p.ExeName), ".exe") {
		out = append(out, filepath.Join(p.AppData, p.ExeName))
	}
	return out
}

func (p Paths) marker() string {
	if d := p.FolioDir(); d != "" {
		return filepath.Join(d, MarkerName)
	}
	return ""
}

// SchedulePurge writes the marker. The profile folders go at the next start.
func (p Paths) SchedulePurge() error {
	m := p.marker()
	if m == "" {
		return errors.New("%LOCALAPPDATA% is not set")
	}
	if err := os.MkdirAll(filepath.Dir(m), 0o755); err != nil {
		return err
	}
	return os.WriteFile(m, []byte("Folio deletes its WebView2 profile at the next start, then removes this file.\n"), 0o644)
}

// RunPending deletes the profile folders if the marker is there, then the marker. A folder that
// cannot be deleted (still locked) keeps the marker, so the next start tries again.
func (p Paths) RunPending() (removed []string, err error) {
	m := p.marker()
	if m == "" {
		return nil, nil
	}
	if _, err := os.Lstat(m); err != nil {
		return nil, nil // no request
	}
	var firstErr error
	for _, dir := range p.ProfileDirs() {
		ok, err := removeGuarded(dir, p.ProfileDirs())
		if err != nil {
			log.Printf("localdata: could not delete %s: %v", dir, err)
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		if ok {
			log.Printf("localdata: deleted %s", dir)
			removed = append(removed, dir)
		}
	}
	if firstErr == nil {
		if err := os.Remove(m); err != nil && !errors.Is(err, fs.ErrNotExist) {
			firstErr = err
		}
	}
	return removed, firstErr
}

// removeGuarded deletes dir only if it is one of the allowed folders, exactly, is absolute, is not
// a drive root or a link, and is a folder. It reports whether something was deleted.
func removeGuarded(dir string, allowed []string) (bool, error) {
	clean := filepath.Clean(dir)
	if !filepath.IsAbs(clean) || filepath.Dir(clean) == clean {
		return false, fmt.Errorf("refusing to delete %q: not a folder path", dir)
	}
	listed := false
	for _, a := range allowed {
		if strings.EqualFold(filepath.Clean(a), clean) {
			listed = true
		}
	}
	if !listed {
		return false, fmt.Errorf("refusing to delete %q: not one of Folio's folders", dir)
	}
	st, err := os.Lstat(clean)
	if errors.Is(err, fs.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if st.Mode()&(os.ModeSymlink|os.ModeIrregular) != 0 || !st.IsDir() {
		return false, fmt.Errorf("refusing to delete %q: it is a link or not a folder", dir)
	}
	if err := os.RemoveAll(clean); err != nil {
		return false, err
	}
	return true, nil
}

// Result is what ClearData did, for the Settings dialog to report.
type Result struct {
	CacheDir         string   `json:"cacheDir"`
	CacheDeleted     bool     `json:"cacheDeleted"`
	ProfileScheduled bool     `json:"profileScheduled"` // the profile is deleted at the next start
	ProfileDirs      []string `json:"profileDirs"`      // the folders that will go
}

// LocalDataService is the Wails service behind the Settings "Clear data" button.
type LocalDataService struct {
	docs  *docs.DocsService
	paths Paths
}

// NewService builds the service for the real environment.
func NewLocalDataService(d *docs.DocsService) *LocalDataService {
	return &LocalDataService{docs: d, paths: Default()}
}

// ClearData deletes the index cache now and schedules the WebView2 profile for the next start.
// settings.json is kept: it holds the folder choice and nothing derived from tickets.
func (s *LocalDataService) ClearData() (Result, error) {
	res := Result{ProfileDirs: []string{}}
	c, err := s.docs.ClearCache()
	res.CacheDir, res.CacheDeleted = c.CacheDir, c.CacheDeleted
	if err != nil {
		return res, err
	}
	if err := s.paths.SchedulePurge(); err != nil {
		return res, err
	}
	res.ProfileScheduled = true
	res.ProfileDirs = append(res.ProfileDirs, s.paths.ProfileDirs()...)
	return res, nil
}
