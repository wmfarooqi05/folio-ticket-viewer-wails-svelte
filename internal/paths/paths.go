// Package paths names the folders Folio keeps on disk, in one place, so the code that
// creates them and the code that deletes them (ticket 18's "Clear data") cannot drift apart.
package paths

import (
	"os"
	"path/filepath"
)

// LocalDir is %LOCALAPPDATA%\Folio: the machine-local, never-roaming folder that holds the
// index cache (docs/cache.go computes the same path) and the WebView2 profile.
func LocalDir() (string, error) {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		ucd, err := os.UserCacheDir()
		if err != nil {
			return "", err
		}
		base = ucd
	}
	return filepath.Join(base, "Folio"), nil
}

// WebView2Dir is the WebView2 user-data folder, %LOCALAPPDATA%\Folio\WebView2 (ticket 16, M2).
// It holds the HTTP cache, cookies and crash data of the embedded browser. The NSIS uninstaller
// removes it, and the "Clear data" action may delete it while the app is stopped.
func WebView2Dir() (string, error) {
	dir, err := LocalDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "WebView2"), nil
}
