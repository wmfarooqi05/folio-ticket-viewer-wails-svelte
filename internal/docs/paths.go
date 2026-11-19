package docs

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
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
	if rel == "" || strings.ContainsRune(rel, 0) {
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
	// Symlink check, only when the target exists.
	if realFull, err := filepath.EvalSymlinks(full); err == nil {
		realRoot, err := filepath.EvalSymlinks(root)
		if err != nil {
			return "", err
		}
		rr, err := filepath.Rel(realRoot, realFull)
		if err != nil || rr == ".." || strings.HasPrefix(rr, ".."+string(filepath.Separator)) {
			return "", ErrEscapesRoot
		}
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
	b, err := os.ReadFile(full)
	if err != nil {
		return "", err
	}
	return strings.TrimPrefix(string(b), "\ufeff"), nil
}
