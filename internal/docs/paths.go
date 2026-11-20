package docs

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/settings"
)

// ErrEscapesRoot is returned for any path that is absolute or leaves the docs root.
var ErrEscapesRoot = errors.New("path escapes the docs root")

// ErrNotMarkdown is returned when a read targets anything other than a .md file.
var ErrNotMarkdown = errors.New("only .md files can be read")

// SafeJoin resolves a POSIX path relative to root and refuses anything that could
// leave root: absolute paths, drive letters, ".." segments and symlinks that point
// outside. Reads accept only *.md (see ResolveMarkdown).
func SafeJoin(root, rel string) (string, error) {
	if root == "" {
		return "", errors.New("no docs root is configured")
	}
	// ":" would name an NTFS alternate data stream (file.png::$DATA) or a drive; no real doc has one.
	if rel == "" || strings.ContainsRune(rel, 0) || strings.ContainsRune(rel, ':') {
		return "", ErrEscapesRoot
	}
	if strings.HasPrefix(rel, "/") || strings.HasPrefix(rel, `\`) || filepath.IsAbs(rel) || filepath.VolumeName(rel) != "" {
		return "", ErrEscapesRoot
	}
	for _, seg := range strings.FieldsFunc(rel, func(r rune) bool { return r == '/' || r == '\\' }) {
		if seg == ".." {
			return "", ErrEscapesRoot
		}
	}
	full := filepath.Join(root, filepath.FromSlash(rel))
	r, err := filepath.Rel(root, full)
	if err != nil || r == ".." || strings.HasPrefix(r, ".."+string(filepath.Separator)) {
		return "", ErrEscapesRoot
	}
	// A link anywhere on the way (in the docs folder, in a folder, in a link's target) that leads to
	// \\host\share would make the Lstat and EvalSymlinks below talk SMB with the user's credentials (a
	// hostile cloned repo). Resolve the path by hand first: Lstat and Readlink only, one part at a time.
	if settings.PathReachesNetwork(full) {
		return "", ErrEscapesRoot
	}
	// Junctions. Go's EvalSymlinks does not follow them (it fails or returns them unchanged),
	// and Lstat reports them as irregular files, so any such folder on the way is refused.
	cur := root
	for _, seg := range strings.FieldsFunc(rel, func(r rune) bool { return r == '/' || r == '\\' }) {
		cur = filepath.Join(cur, seg)
		fi, err := os.Lstat(cur)
		if err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				break
			}
			return "", ErrEscapesRoot
		}
		if fi.Mode()&os.ModeIrregular != 0 {
			return "", ErrEscapesRoot
		}
	}
	// Symlink check. A target that does not exist yet is fine; any other
	// failure to resolve it is refused, so an unreadable link never passes as inside.
	realFull, err := filepath.EvalSymlinks(full)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return full, nil
		}
		return "", ErrEscapesRoot
	}
	realRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		return "", err
	}
	rr, err := filepath.Rel(realRoot, realFull)
	if err != nil || rr == ".." || strings.HasPrefix(rr, ".."+string(filepath.Separator)) {
		return "", ErrEscapesRoot
	}
	return full, nil
}

// ResolveMarkdown is SafeJoin plus the .md-only rule for reads.
func ResolveMarkdown(root, rel string) (string, error) {
	full, err := SafeJoin(root, rel)
	if err != nil {
		return "", err
	}
	if !strings.EqualFold(filepath.Ext(full), ".md") {
		return "", fmt.Errorf("%w: %s", ErrNotMarkdown, rel)
	}
	return full, nil
}

// readText reads a file and strips a UTF-8 byte order mark, so the parser's
// leading "---" check is not defeated by editors that write one.
func readText(full string) (string, error) {
	f, err := os.Open(full)
	if err != nil {
		return "", err
	}
	defer f.Close()
	// One byte past the cap tells a file that grew after its stat from one that fits.
	b, err := io.ReadAll(io.LimitReader(f, MaxFileBytes+1))
	if err != nil {
		return "", err
	}
	if len(b) > MaxFileBytes {
		return "", errFileGrew
	}
	return strings.TrimPrefix(string(b), "\ufeff"), nil
}

// errFileGrew means a file passed the size check and was over the cap by the time it was read.
var errFileGrew = errors.New("file grew past the size cap while it was read")
