package shell

import (
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/docs"
	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/settings"
)

// Ticket 25: what a docs folder looks like, for CheckRoot, CheckDocs and the Settings chips. The
// Node backend (frontend/src/server/shell.ts) does the same, and the contract suite holds them equal.

// scanBudget bounds how many entries one markdown search looks at, so a huge folder of assets
// cannot stall a folder check. A folder that runs out of budget counts as "has none".
const scanBudget = 20000

// wholeLabel is how a "." root reads in a message.
const wholeLabel = "the docs folder itself"

// rootLabel is one root as the messages name it: "modules/", or the whole docs folder.
func rootLabel(r string) string {
	if settings.IsWholeRoot(r) {
		return wholeLabel
	}
	return r + "/"
}

func joinRoots(roots []string) string {
	labels := make([]string, len(roots))
	for i, r := range roots {
		labels[i] = rootLabel(r)
	}
	return strings.Join(labels, " · ")
}

// ExpectsMessage is what a folder with none of the roots (and no map.md or issues/ folder) is told.
func ExpectsMessage(roots []string) string {
	return "expects " + joinRoots(roots) + ", or a map.md or issues/ folder, inside the folder"
}

// probe splits roots into those that exist under dir and those that do not. "." exists when the
// docs folder holds any .md at all.
func probe(dir string, roots []string) (found, missing []string) {
	found, missing = []string{}, []string{}
	for _, r := range roots {
		ok := false
		if settings.IsWholeRoot(r) {
			ok = hasMarkdown(dir)
		} else {
			ok = settings.SafeIsDir(filepath.Join(dir, filepath.FromSlash(r)))
		}
		if ok {
			found = append(found, r)
		} else {
			missing = append(missing, r)
		}
	}
	return found, missing
}

// isSpaceDir reports whether dir holds a map.md or an issues/ folder.
func isSpaceDir(dir string) bool {
	if !settings.SafeIsDir(dir) {
		return false
	}
	if st, err := os.Stat(filepath.Join(dir, "map.md")); err == nil && st.Mode().IsRegular() {
		return true
	}
	return settings.SafeIsDir(filepath.Join(dir, "issues"))
}

// hasMarkdown reports whether dir holds a .md file anywhere in scope (not under node_modules, dot
// folders or "_" folders, which Folio never indexes).
func hasMarkdown(dir string) bool {
	if !settings.SafeIsDir(dir) {
		return false
	}
	seen := 0
	found := false
	_ = filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if seen++; seen > scanBudget || found {
			return filepath.SkipAll
		}
		if d.IsDir() {
			if p != dir && docs.SkipDir(d.Name()) {
				return filepath.SkipDir
			}
			return nil
		}
		if strings.EqualFold(filepath.Ext(p), ".md") {
			found = true
			return filepath.SkipAll
		}
		return nil
	})
	return found
}

// topFolders lists dir's top-level folders that hold any .md, sorted. [] when there are none.
func topFolders(dir string) []string {
	out := []string{}
	if !settings.SafeIsDir(dir) {
		return out
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return out
	}
	for _, e := range entries {
		if !e.IsDir() || docs.SkipDir(e.Name()) {
			continue
		}
		if hasMarkdown(filepath.Join(dir, e.Name())) {
			out = append(out, e.Name())
		}
	}
	slices.Sort(out)
	return out
}
