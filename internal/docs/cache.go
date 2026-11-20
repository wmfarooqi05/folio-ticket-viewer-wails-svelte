package docs

import (
	"bytes"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"runtime/debug"
	"slices"
	"strings"
	"sync"
	"time"
)

// cacheVersion is the envelope format. A different value drops the cache.
const cacheVersion = 1

// cacheEnvelope is the file on disk. The index is the frontend's bytes, never decoded.
type cacheEnvelope struct {
	V             int                 `json:"v"`
	ParserVersion string              `json:"parserVersion"`
	DocsRoot      string              `json:"docsRoot"`
	Roots         []string            `json:"roots"`
	Stamps        map[string][2]int64 `json:"stamps"` // path -> [mtime ms, size]
	Index         json.RawMessage     `json:"index"`
}

// setCacheDir overrides where cache files go. Tests use a temp dir; the app leaves
// it unset and gets %LOCALAPPDATA%\Folio\cache. The cache never goes inside the docs root.
func (s *DocsService) setCacheDir(dir string) {
	s.mu.Lock()
	s.cacheDir = dir
	s.mu.Unlock()
}

// normRoot is the docs root as the cache sees it: Windows paths are case-insensitive.
func normRoot(docs string) string {
	return strings.ToLower(filepath.ToSlash(filepath.Clean(docs)))
}

// cacheFolder is where cache files go: the override, or %LOCALAPPDATA%\Folio\cache.
func (s *DocsService) cacheFolder() (string, error) {
	if s.cacheDir != "" {
		return s.cacheDir, nil
	}
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		ucd, err := os.UserCacheDir()
		if err != nil {
			return "", err
		}
		base = ucd
	}
	return filepath.Join(base, "Folio", "cache"), nil
}

func (s *DocsService) cachePath(r Roots) (string, error) {
	dir, err := s.cacheFolder()
	if err != nil {
		return "", err
	}
	sum := sha1.Sum([]byte(normRoot(r.Docs)))
	return filepath.Join(dir, hex.EncodeToString(sum[:])[:12]+".json"), nil
}

// LoadCache returns the cached index as raw JSON, or nil when there is no cache, it
// is corrupt, or parserVersion, docsRoot or the roots differ. A bad file is deleted.
// On a hit it also loads the stamps, so the next Scan reports only what changed.
func (s *DocsService) LoadCache(parserVersion string) (json.RawMessage, error) {
	r := s.roots()
	if r.Docs == "" {
		return nil, errors.New("no docs root is configured")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	path, err := s.cachePath(r)
	if err != nil {
		return nil, err
	}
	// A crash between CreateTemp and Rename leaves a temp file behind: sweep them.
	if stale, _ := filepath.Glob(path + ".*.tmp"); len(stale) > 0 {
		for _, f := range stale {
			_ = os.Remove(f)
		}
	}
	b, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var env cacheEnvelope
	if err := json.Unmarshal(b, &env); err != nil || env.V != cacheVersion || len(env.Index) == 0 || bytes.Equal(env.Index, []byte("null")) {
		log.Printf("docs.LoadCache: corrupt cache, deleting %s", path)
		_ = os.Remove(path)
		return nil, nil
	}
	if env.ParserVersion != parserVersion || env.DocsRoot != normRoot(r.Docs) || !slices.Equal(env.Roots, r.Roots) {
		log.Printf("docs.LoadCache: cache is for another parser or root, cold start")
		return nil, nil
	}
	s.stamps = make(map[string]stamp, len(env.Stamps))
	for p, v := range env.Stamps {
		s.stamps[p] = stamp{Mtime: v[0], Size: v[1]}
	}
	s.announced = map[string]stamp{}
	log.Printf("docs.LoadCache: %d files, %d KB", len(env.Stamps), len(b)/1024)
	return env.Index, nil
}

// SaveCache writes {envelope, stamps, index} atomically: a temp file in the same
// folder, then a rename over the old one. Go writes the index bytes without decoding.
func (s *DocsService) SaveCache(parserVersion string, index json.RawMessage) error {
	r := s.roots()
	if r.Docs == "" {
		return errors.New("no docs root is configured")
	}
	if len(index) == 0 {
		return errors.New("empty index")
	}
	s.mu.Lock()
	if s.noSave {
		s.mu.Unlock()
		return nil // "Clear data" ran: the cache stays gone until Folio restarts
	}
	path, err := s.cachePath(r)
	if err != nil {
		s.mu.Unlock()
		return err
	}
	env := cacheEnvelope{
		V: cacheVersion, ParserVersion: parserVersion,
		DocsRoot: normRoot(r.Docs), Roots: r.Roots,
		Stamps: make(map[string][2]int64, len(s.stamps)), Index: index,
	}
	for p, st := range s.stamps {
		env.Stamps[p] = [2]int64{st.Mtime, st.Size}
	}
	s.mu.Unlock()
	if env.Roots == nil {
		env.Roots = []string{}
	}
	b, err := json.Marshal(env)
	if err != nil {
		return err
	}
	return writeAtomic(path, b)
}

func writeAtomic(path string, b []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), filepath.Base(path)+".*.tmp")
	if err != nil {
		return err
	}
	name := tmp.Name()
	if _, err := tmp.Write(b); err != nil {
		tmp.Close()
		os.Remove(name)
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		os.Remove(name)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(name)
		return err
	}
	// Antivirus and indexers briefly hold files on Windows: retry the rename a few times.
	var rerr error
	for i := 0; i < 5; i++ {
		if rerr = os.Rename(name, path); rerr == nil {
			return nil
		}
		time.Sleep(time.Duration(i+1) * 20 * time.Millisecond)
	}
	os.Remove(name)
	return rerr
}

var freeOnce sync.Once

// LogTimings writes a frontend timing line to the Go log, so a launch can be read
// from one place (AC1). Its first call is the start timings, sent once the index is up; that
// also schedules one debug.FreeOSMemory two seconds later, which hands the scan's garbage back
// to Windows (measured in ticket 15: about -3.6 MB private at idle, nothing else changes).
func (s *DocsService) LogTimings(line string) {
	freeOnce.Do(func() {
		go func() {
			time.Sleep(2 * time.Second)
			debug.FreeOSMemory()
		}()
	})
	if len(line) > 500 {
		line = line[:500]
	}
	log.Printf("folio.timing: %s", line)
}
