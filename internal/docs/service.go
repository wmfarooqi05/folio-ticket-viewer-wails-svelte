// Package docs is Folio's file-system side: it stats, reads and watches markdown
// files and hands bytes to the frontend. It never parses them and never keeps file
// text (docs/issues/05-index-cache-refresh.md, D1).
package docs

import (
	"errors"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"
)

// ChangedEvent is the one debounced event Go emits (a ChangeSet payload).
const ChangedEvent = "docs:changed"

// readWorkers bounds the ReadBatch pool. Tune on the slow VM (05 draft 1.2).
const readWorkers = 4

// SourceFile is the parser's input record, exactly as in the 04 contract.
type SourceFile struct {
	Path  string `json:"path"`  // POSIX, relative to the docs root
	Text  string `json:"text"`  //
	Mtime int64  `json:"mtime"` // unix ms
}

// ScanResult is what Scan reports to the frontend.
type ScanResult struct {
	Changed []string `json:"changed"` // new, or the stamp differs from what was delivered
	Removed []string `json:"removed"` // known before, no longer on disk
	Count   int      `json:"count"`   // .md files on disk
	WalkMs  int64    `json:"walkMs"`
	// TooLarge is every .md on disk over MaxFileBytes, not a delta: it is what the walk's own stat
	// said, so the tree can say "too large" for a file whose stamp has not changed (a warm start).
	TooLarge []TooLargeFile `json:"tooLarge"`
}

// MaxFileBytes is the per-file cap (L6): a .md over this is not read, and the tree says why.
// 5 MB is far beyond any ticket and keeps one stray file from stalling a scan or the parser.
const MaxFileBytes = 5 << 20

// TooLargeFile is a .md that ReadBatch skipped because it is over MaxFileBytes.
type TooLargeFile struct {
	Path string `json:"path"`
	Size int64  `json:"size"` // bytes
}

// BatchResult is the answer to ReadBatch.
type BatchResult struct {
	Files    []SourceFile   `json:"files"`
	Missing  []string       `json:"missing"`  // deleted between scan and read
	Failed   []string       `json:"failed"`   // could not be read now (a sharing violation); retry
	TooLarge []TooLargeFile `json:"tooLarge"` // over MaxFileBytes: stat only, never read
}

// megabytes formats a size the way both backends print it: "10.0 MB".
func megabytes(n int64) string { return fmt.Sprintf("%.1f MB", float64(n)/(1<<20)) }

// errTooLarge is the ReadFile error for a file over MaxFileBytes.
func errTooLarge(size int64) error {
	return fmt.Errorf("file is too large (%s; the limit is %s)", megabytes(size), megabytes(MaxFileBytes))
}

// ChangeSet is the payload of the "docs:changed" event.
type ChangeSet struct {
	Changed []string `json:"changed"`
	Removed []string `json:"removed"`
	Rescan  bool     `json:"rescan"` // true after a watcher overflow or error
}

// Roots tells the service where to look. It is read on every call, so a settings
// change takes effect without restarting.
type Roots struct {
	Docs  string   // absolute docs root; paths in the API are relative to it
	Roots []string // folders under Docs to index, e.g. modules, handoffs, patterns
}

// stamp is the per-file identity Go remembers: never file text.
type stamp struct {
	Mtime int64
	Size  int64
}

// DocsService is registered with Wails (the bindings use the type name).
type DocsService struct {
	roots func() Roots
	emit  func(ChangeSet)

	mu     sync.Mutex
	stamps map[string]stamp // path -> last delivered (or cached) stamp
	// announced is the stamp the watcher last reported for a path, so a second flush
	// of the same state is dropped before the frontend has read the file.
	announced map[string]stamp
	watch     *watcher
	closed    bool
	gen       uint64 // bumped by every startWatcher; a scan from an older one is discarded
	cacheDir  string // empty means %LOCALAPPDATA%\Folio\cache
	noSave    bool   // set by ClearCache: nothing is written to the cache again until restart
}

// NewService builds the service. roots is called on every request. emit sends
// ChangedEvent to the frontend; it may be nil (tests).
func NewService(roots func() Roots, emit func(ChangeSet)) *DocsService {
	return &DocsService{roots: roots, emit: emit, stamps: map[string]stamp{}, announced: map[string]stamp{}}
}

// ServiceShutdown stops the watcher when the app exits. It never closes fsnotify
// under the lock or waits for it: Close can block on Windows while an error is pending.
func (s *DocsService) ServiceShutdown() error {
	s.mu.Lock()
	s.closed = true
	w := s.watch
	s.watch = nil
	s.mu.Unlock()
	if w != nil {
		w.closeAsync()
	}
	return nil
}

// send emits a ChangeSet unless the service has shut down.
func (s *DocsService) send(cs ChangeSet) {
	s.mu.Lock()
	closed := s.closed
	s.mu.Unlock()
	if !closed && s.emit != nil {
		s.emit(cs)
	}
}

// Rescan is the manual Rescan command (Ctrl+R) and the overflow fallback.
//
// It drops the stamps and runs a full Scan, so every file is in Changed. The
// frontend uses it when the roots changed (Settings) and builds a fresh index.
func (s *DocsService) Rescan() (ScanResult, error) {
	s.mu.Lock()
	s.stamps = map[string]stamp{}
	s.announced = map[string]stamp{}
	s.mu.Unlock()
	return s.Scan()
}

// errSuperseded means a newer Scan (a Settings rescan, say) took over while this one ran.
var errSuperseded = errors.New("scan superseded by a newer one")

// Scan walks the configured roots and diffs the result against the known stamps.
// With no stamps, every file is in Changed. It also (re)starts the watcher, before
// the walk, so no change can fall between the two.
func (s *DocsService) Scan() (ScanResult, error) {
	// A scan started by the watcher's error recovery can overlap this one. The newer
	// generation wins, so a superseded frontend scan is simply run again: errSuperseded
	// never reaches the frontend.
	for attempt := 0; ; attempt++ {
		res, err := s.scan(false)
		if !errors.Is(err, errSuperseded) || attempt >= 3 {
			return res, err
		}
	}
}

// scan is Scan. With announce set (the rescan after a watcher error) it also records
// the walked stamps of the changed files as announced, without extra stat calls.
func (s *DocsService) scan(announce bool) (ScanResult, error) {
	r := s.roots()
	if r.Docs == "" {
		return ScanResult{}, errors.New("no docs root is configured")
	}
	gen := s.startWatcher(r)

	start := time.Now()
	found, err := walkMarkdown(r)
	if err != nil {
		return ScanResult{}, err
	}
	walkMs := time.Since(start).Milliseconds()

	s.mu.Lock()
	defer s.mu.Unlock()
	// A newer Scan (with its own watcher) or a roots change while we walked: our
	// result describes the old roots, so it must not touch the stamps.
	if s.gen != gen || !sameRoots(r, s.roots()) {
		return ScanResult{}, errSuperseded
	}
	res := ScanResult{Changed: []string{}, Removed: []string{}, Count: len(found), WalkMs: walkMs, TooLarge: []TooLargeFile{}}
	for p, st := range found {
		if st.Size > MaxFileBytes {
			res.TooLarge = append(res.TooLarge, TooLargeFile{Path: p, Size: st.Size})
		}
	}
	slices.SortFunc(res.TooLarge, func(a, b TooLargeFile) int { return strings.Compare(a.Path, b.Path) })
	for p, st := range found {
		if old, ok := s.stamps[p]; !ok || old != st {
			res.Changed = append(res.Changed, p)
			if announce {
				s.announced[p] = st
			}
		}
	}
	for p := range s.stamps {
		if _, ok := found[p]; !ok {
			res.Removed = append(res.Removed, p)
			delete(s.stamps, p)
		}
	}
	for p := range s.announced {
		if _, ok := found[p]; !ok {
			delete(s.announced, p)
		}
	}
	slices.Sort(res.Changed)
	slices.Sort(res.Removed)
	log.Printf("docs.Scan: %d .md files, %d changed, %d removed, walk %d ms", res.Count, len(res.Changed), len(res.Removed), walkMs)
	return res, nil
}

func sameRoots(a, b Roots) bool {
	return a.Docs == b.Docs && slices.Equal(a.Roots, b.Roots)
}

// ReadBatch reads the files in one IPC call with a bounded pool. It stats before
// reading and records that stamp as delivered.
func (s *DocsService) ReadBatch(paths []string) (BatchResult, error) {
	r := s.roots()
	type outcome struct {
		file    SourceFile
		stamp   stamp
		missing bool
		tooBig  bool
		size    int64
		err     error
	}
	out := make([]outcome, len(paths))

	// Validate every path first, so one bad path fails the whole call before any I/O.
	fulls := make([]string, len(paths))
	for i, p := range paths {
		full, err := ResolveMarkdown(r.Docs, p)
		if err != nil {
			return BatchResult{}, err
		}
		fulls[i] = full
	}

	var wg sync.WaitGroup
	sem := make(chan struct{}, readWorkers)
	for i := range paths {
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			st, err := os.Stat(fulls[i])
			if errors.Is(err, fs.ErrNotExist) {
				out[i].missing = true
				return
			}
			if err != nil {
				out[i].err = err
				return
			}
			out[i].stamp = stamp{Mtime: st.ModTime().UnixMilli(), Size: st.Size()}
			if st.Size() > MaxFileBytes {
				// Over the cap: reported from the stat alone, so a huge file costs no read.
				out[i].tooBig, out[i].size = true, st.Size()
				return
			}
			text, err := readText(fulls[i])
			if errors.Is(err, fs.ErrNotExist) {
				out[i].missing = true
				return
			}
			if errors.Is(err, errFileGrew) {
				out[i].tooBig, out[i].size = true, MaxFileBytes+1
				return
			}
			if err != nil {
				out[i].err = err
				return
			}
			out[i].file = SourceFile{Path: paths[i], Text: text, Mtime: out[i].stamp.Mtime}
		}()
	}
	wg.Wait()

	res := BatchResult{Files: make([]SourceFile, 0, len(paths)), Missing: []string{}, Failed: []string{}, TooLarge: []TooLargeFile{}}
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, o := range out {
		switch {
		case o.err != nil:
			// One unreadable file (a sharing violation, say) must not fail the batch.
			// It is reported, and its announced stamp is cleared so a retry is seen.
			log.Printf("docs.ReadBatch: %s: %v", paths[i], o.err)
			res.Failed = append(res.Failed, paths[i])
			delete(s.announced, paths[i])
		case o.tooBig:
			// Delivered, as far as Go is concerned: the frontend holds a stub for it, so a later
			// delete is seen by Scan and an unchanged file is not read again. Scan's TooLarge says why.
			res.TooLarge = append(res.TooLarge, TooLargeFile{Path: paths[i], Size: o.size})
			s.stamps[paths[i]] = o.stamp
		case o.missing:
			res.Missing = append(res.Missing, paths[i])
			delete(s.stamps, paths[i])
			delete(s.announced, paths[i])
		default:
			res.Files = append(res.Files, o.file)
			s.stamps[paths[i]] = o.stamp
		}
	}
	return res, nil
}

// ReadFile returns one file's text for rendering. It does not touch stamps.
func (s *DocsService) ReadFile(path string) (string, error) {
	full, err := ResolveMarkdown(s.roots().Docs, path)
	if err != nil {
		return "", err
	}
	if st, err := os.Stat(full); err == nil && st.Size() > MaxFileBytes {
		return "", errTooLarge(st.Size())
	}
	text, err := readText(full)
	if errors.Is(err, errFileGrew) {
		return "", errTooLarge(MaxFileBytes + 1)
	}
	return text, err
}

// walkMarkdown returns the stamp of every .md file under the configured roots,
// keyed by POSIX path relative to the docs root. Missing roots are skipped.
func walkMarkdown(r Roots) (map[string]stamp, error) {
	found := map[string]stamp{}
	for _, root := range r.Roots {
		base := filepath.Join(r.Docs, filepath.FromSlash(root))
		if st, err := os.Stat(base); err != nil || !st.IsDir() {
			continue
		}
		err := filepath.WalkDir(base, func(p string, d fs.DirEntry, err error) error {
			if err != nil {
				if p == base {
					return err
				}
				return nil // unreadable subfolder: skip it
			}
			if d.IsDir() {
				if p != base && skipDir(d.Name()) {
					return filepath.SkipDir
				}
				return nil
			}
			if !strings.EqualFold(filepath.Ext(p), ".md") {
				return nil
			}
			info, err := d.Info()
			if err != nil {
				return nil
			}
			rel, err := filepath.Rel(r.Docs, p)
			if err != nil {
				return nil
			}
			found[filepath.ToSlash(rel)] = stamp{Mtime: info.ModTime().UnixMilli(), Size: info.Size()}
			return nil
		})
		if err != nil {
			return nil, err
		}
	}
	return found, nil
}

// skipDir is the scope rule shared by the walk and the watcher: node_modules, dot
// folders and "_"-prefixed folders (such as _templates) are never indexed.
func skipDir(name string) bool {
	return name == "node_modules" || strings.HasPrefix(name, ".") || strings.HasPrefix(name, "_")
}
