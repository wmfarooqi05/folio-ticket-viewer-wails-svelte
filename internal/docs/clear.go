package docs

import (
	"errors"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"
)

// ClearResult is what ClearCache did.
type ClearResult struct {
	CacheDir     string `json:"cacheDir"`
	CacheDeleted bool   `json:"cacheDeleted"` // false when there was nothing to delete
}

// IsFolioCacheDir reports whether dir looks like Folio's own cache folder, <something>\Folio\cache.
// ClearCache refuses anything else, so a wrong cache path can never make it delete another folder.
func IsFolioCacheDir(dir string) bool {
	dir = filepath.Clean(dir)
	return strings.EqualFold(filepath.Base(dir), "cache") && strings.EqualFold(filepath.Base(filepath.Dir(dir)), "Folio")
}

// ClearCache deletes the index cache folder (L5) and stops the service from writing it again
// until Folio restarts, so the frontend's next save cannot bring the plaintext copy back. It
// deletes only a folder that IsFolioCacheDir accepts and never follows a link.
func (s *DocsService) ClearCache() (ClearResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	dir, err := s.cacheFolder()
	if err != nil {
		return ClearResult{}, err
	}
	res := ClearResult{CacheDir: dir}
	if !IsFolioCacheDir(dir) {
		return res, fmt.Errorf("refusing to delete %s: it is not a Folio cache folder", dir)
	}
	s.noSave = true
	st, err := os.Lstat(dir)
	if errors.Is(err, fs.ErrNotExist) {
		return res, nil
	}
	if err != nil {
		return res, err
	}
	if st.Mode()&(os.ModeSymlink|os.ModeIrregular) != 0 || !st.IsDir() {
		return res, fmt.Errorf("refusing to delete %s: it is a link or not a folder", dir)
	}
	if err := os.RemoveAll(dir); err != nil {
		return res, err
	}
	res.CacheDeleted = true
	log.Printf("docs.ClearCache: deleted %s", dir)
	return res, nil
}
