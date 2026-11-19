package docs

import (
	"errors"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

const (
	debounceQuiet = 200 * time.Millisecond // trailing debounce
	debounceMax   = time.Second            // a flush is forced after this long
)

// watcher is a recursive fsnotify watcher over the configured roots. It collects
// events into a set of paths and judges each one by stat at flush time, against the
// stamps the service has delivered (docs/issues/05, D3).
type watcher struct {
	w     *fsnotify.Watcher
	docs  string
	svc   *DocsService
	emit  func(ChangeSet)
	quiet time.Duration // trailing debounce
	max   time.Duration // a flush is forced after this long
	done  chan struct{}
	once  sync.Once
}

// startWatcher (re)creates the watcher for r. It registers every directory first;
// Scan walks afterwards, so no change falls between the two.
func (s *DocsService) startWatcher(r Roots) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.watch != nil {
		s.watch.close()
		s.watch = nil
	}
	if s.emit == nil {
		return
	}
	w, err := newWatcher(r, s)
	if err != nil {
		log.Printf("docs: watcher not started: %v", err)
		return
	}
	s.watch = w
}

func newWatcher(r Roots, svc *DocsService) (*watcher, error) {
	fw, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}
	w := &watcher{w: fw, docs: r.Docs, svc: svc, emit: svc.emit,
		quiet: debounceQuiet, max: debounceMax, done: make(chan struct{})}
	start := time.Now()
	n := 0
	for _, root := range r.Roots {
		n += w.addTree(filepath.Join(r.Docs, filepath.FromSlash(root)))
	}
	log.Printf("docs: watching %d directories (registered in %s)", n, time.Since(start))
	go w.loop()
	return w, nil
}

func (w *watcher) close() {
	w.once.Do(func() {
		close(w.done)
		_ = w.w.Close()
	})
}

// addTree registers dir and every directory beneath it, returning how many.
// The Windows buffer is raised to 256 KB so a big checkout is less likely to overflow.
func (w *watcher) addTree(dir string) int {
	n := 0
	_ = filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil || !d.IsDir() {
			return nil
		}
		if p != dir && skipDir(d.Name()) {
			return filepath.SkipDir
		}
		if w.w.AddWith(p, fsnotify.WithBufferSize(256<<10)) == nil {
			n++
		}
		return nil
	})
	return n
}

func (w *watcher) rel(abs string) (string, bool) {
	r, err := filepath.Rel(w.docs, abs)
	if err != nil || r == ".." || strings.HasPrefix(r, ".."+string(filepath.Separator)) {
		return "", false
	}
	return filepath.ToSlash(r), true
}

// inScope reports whether rel passes through a skipped folder below its root.
func inScope(rel string) bool {
	parts := strings.Split(rel, "/")
	for _, seg := range parts[1:] { // parts[0] is a configured root
		if skipDir(seg) {
			return false
		}
	}
	return true
}

func (w *watcher) loop() {
	pending := map[string]struct{}{}
	var gone []string // directory prefixes removed or renamed away
	var quiet, forced <-chan time.Time

	flush := func() {
		quiet, forced = nil, nil
		for _, dir := range gone {
			for _, p := range w.svc.knownUnder(dir) {
				pending[p] = struct{}{}
			}
		}
		gone = nil
		cs := w.svc.judge(pending)
		pending = map[string]struct{}{}
		if len(cs.Changed) > 0 || len(cs.Removed) > 0 {
			log.Printf("docs: %s changed=%d removed=%d", ChangedEvent, len(cs.Changed), len(cs.Removed))
			w.emit(cs)
		}
	}
	arm := func() {
		quiet = time.After(w.quiet)
		if forced == nil {
			forced = time.After(w.max)
		}
	}

	for {
		select {
		case <-w.done:
			return
		case ev, ok := <-w.w.Events:
			if !ok {
				return
			}
			rel, inRoot := w.rel(ev.Name)
			if !inRoot || !inScope(rel) {
				continue
			}
			if ev.Has(fsnotify.Create) {
				if st, err := os.Stat(ev.Name); err == nil && st.IsDir() {
					if !skipDir(filepath.Base(ev.Name)) {
						// Register first, then walk: a file made before the watch exists is
						// found by the walk, one made after arrives as an event.
						w.addTree(ev.Name)
						_ = filepath.WalkDir(ev.Name, func(p string, d fs.DirEntry, err error) error {
							if err != nil {
								return nil
							}
							if d.IsDir() {
								if p != ev.Name && skipDir(d.Name()) {
									return filepath.SkipDir
								}
								return nil
							}
							if strings.EqualFold(filepath.Ext(p), ".md") {
								if r, ok := w.rel(p); ok {
									pending[r] = struct{}{}
								}
							}
							return nil
						})
						arm()
					}
					continue
				}
			}
			if strings.EqualFold(filepath.Ext(ev.Name), ".md") {
				pending[rel] = struct{}{}
				arm()
				continue
			}
			// No .md extension: possibly a directory deleted or renamed away. The event
			// names only the directory, so sweep the known paths beneath it at flush.
			if ev.Has(fsnotify.Remove) || ev.Has(fsnotify.Rename) {
				gone = append(gone, rel)
				arm()
			}
		case err, ok := <-w.w.Errors:
			if !ok {
				return
			}
			// Overflow or any other watcher error: the pending set is no longer
			// trustworthy. Rebuild the watcher and diff the whole tree.
			log.Printf("docs: watch error, rescanning: %v", err)
			w.svc.rescanAfterError()
			return // Scan started a fresh watcher; this one is closed
		case <-quiet:
			flush()
		case <-forced:
			flush()
		}
	}
}

// knownUnder lists the known (delivered or announced) paths under a directory prefix.
func (s *DocsService) knownUnder(dir string) []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	prefix := dir + "/"
	var out []string
	for p := range s.stamps {
		if strings.HasPrefix(p, prefix) {
			out = append(out, p)
		}
	}
	for p := range s.announced {
		if strings.HasPrefix(p, prefix) {
			out = append(out, p)
		}
	}
	return out
}

// judge turns a set of touched paths into a ChangeSet by stat, not by event type.
// A path whose stamp equals the delivered or the last announced one is dropped,
// which absorbs no-op saves and duplicate events. A gone path is Removed only if
// it was known. Removed paths are forgotten at once, so a re-create is seen.
func (s *DocsService) judge(paths map[string]struct{}) ChangeSet {
	cs := ChangeSet{Changed: []string{}, Removed: []string{}}
	docs := s.roots().Docs
	s.mu.Lock()
	defer s.mu.Unlock()
	for p := range paths {
		full, err := ResolveMarkdown(docs, p)
		if err != nil {
			continue
		}
		st, err := os.Stat(full)
		if errors.Is(err, fs.ErrNotExist) {
			_, delivered := s.stamps[p]
			_, announced := s.announced[p]
			if delivered || announced {
				cs.Removed = append(cs.Removed, p)
				delete(s.stamps, p)
				delete(s.announced, p)
			}
			continue
		}
		if err != nil || st.IsDir() {
			continue
		}
		cur := stamp{Mtime: st.ModTime().UnixMilli(), Size: st.Size()}
		if old, ok := s.stamps[p]; ok && old == cur {
			continue
		}
		if a, ok := s.announced[p]; ok && a == cur {
			continue
		}
		s.announced[p] = cur
		cs.Changed = append(cs.Changed, p)
	}
	slices.Sort(cs.Changed)
	slices.Sort(cs.Removed)
	return cs
}

// rescanAfterError runs after a watcher overflow or error. Scan starts a new watcher
// (registering first) and diffs the walk against the stamps. The result goes out as
// a ChangeSet with Rescan set, so the frontend reconciles it as one batch.
func (s *DocsService) rescanAfterError() {
	res, err := s.Scan()
	if err != nil {
		log.Printf("docs: rescan after watcher error failed: %v", err)
		return
	}
	s.mu.Lock()
	for _, p := range res.Changed {
		if full, err := ResolveMarkdown(s.roots().Docs, p); err == nil {
			if st, err := os.Stat(full); err == nil {
				s.announced[p] = stamp{Mtime: st.ModTime().UnixMilli(), Size: st.Size()}
			}
		}
	}
	s.mu.Unlock()
	if s.emit != nil {
		s.emit(ChangeSet{Changed: res.Changed, Removed: res.Removed, Rescan: true})
	}
}
