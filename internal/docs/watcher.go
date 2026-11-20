package docs

import (
	"errors"
	"io/fs"
	"log"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"

	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/settings"
)

const (
	debounceQuiet = 200 * time.Millisecond // trailing debounce
	debounceMax   = time.Second            // a flush is forced after this long
)

// watchBufferSize is the ReadDirectoryChangesW buffer per directory (Windows). A var
// so a test can shrink it and cause real overflows.
var watchBufferSize = 256 << 10

// watcher is a directory-by-directory fsnotify watcher over the configured roots. It
// collects events into a set of paths and judges each one by stat at flush time,
// against the stamps the service has delivered (docs/issues/05, D3).
//
// fsnotify on Windows deadlocks if its reader goroutine is blocked sending an event
// or error that nobody drains, so: the loop never calls AddWith or Close, and never
// blocks except on its own select.
//
// Recursive watching ("root\...") was considered and not used: it ignores the
// skip rules (node_modules, dot and _ folders would flood the one shared buffer
// with events) and one buffer per tree overflows sooner than one per directory.
type watcher struct {
	w     *fsnotify.Watcher
	docs  string
	whole bool // a "." root: the whole docs folder is watched, so the first path part is an ordinary folder
	svc   *DocsService
	emit  func(ChangeSet)
	quiet time.Duration // trailing debounce
	max   time.Duration // a flush is forced after this long
	done  chan struct{}
	once  sync.Once
	found chan []string // .md paths found under a new directory, posted by its walker
}

// startWatcher (re)creates the watcher for r and returns the generation it took. It
// registers every directory first; Scan walks afterwards, so no change falls between
// the two. Registration runs without s.mu held (the loop needs the lock to flush, and
// AddWith waits on the reader). Only the newest generation is swapped in, so a slow
// rescan on old roots cannot replace the watcher of a newer one. The old watcher is
// closed asynchronously, never under the lock.
func (s *DocsService) startWatcher(r Roots) uint64 {
	s.mu.Lock()
	s.gen++
	gen := s.gen
	s.mu.Unlock()
	if s.emit == nil {
		return gen
	}
	w, err := newWatcher(r, s)
	if err != nil {
		log.Printf("docs: watcher not started: %v", err)
		return gen
	}
	s.mu.Lock()
	if s.closed || s.gen != gen {
		s.mu.Unlock()
		w.closeAsync()
		return gen
	}
	old := s.watch
	s.watch = w
	s.mu.Unlock()
	if old != nil {
		old.closeAsync()
	}
	return gen
}

func newWatcher(r Roots, svc *DocsService) (*watcher, error) {
	fw, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}
	w := &watcher{w: fw, docs: r.Docs, whole: slices.ContainsFunc(r.Roots, settings.IsWholeRoot), svc: svc, emit: svc.send,
		quiet: debounceQuiet, max: debounceMax, done: make(chan struct{}),
		found: make(chan []string, 16)}
	// The loop runs first so it drains Events while AddWith registers directories.
	go w.loop()
	start := time.Now()
	n := 0
	for _, root := range r.Roots {
		n += w.addTree(filepath.Join(r.Docs, filepath.FromSlash(root)))
	}
	log.Printf("docs: watching %d directories (registered in %s)", n, time.Since(start))
	return w, nil
}

// closeAsync stops the loop and closes fsnotify in the background. On Windows Close
// can block while an error is pending, and its "done" message is swallowed by a
// reader parked in sendError. So first drain until Errors has been quiet for 200 ms,
// then Close in its own goroutine while draining, and give up after 5 s (leak, not block).
func (w *watcher) closeAsync() {
	w.once.Do(func() {
		close(w.done)
		go func() {
			t := time.After(5 * time.Second)
		quiet:
			for q := time.After(200 * time.Millisecond); ; {
				select {
				case <-w.w.Events:
				case <-w.w.Errors:
					q = time.After(200 * time.Millisecond)
				case <-q:
					break quiet
				case <-t:
					return
				}
			}
			c := make(chan struct{})
			go func() { _ = w.w.Close(); close(c) }()
			for {
				select {
				case <-c:
					return
				case <-w.w.Events:
				case <-w.w.Errors:
				case <-t:
					return
				}
			}
		}()
	})
}

// addTree registers dir and every directory beneath it, returning how many.
func (w *watcher) addTree(dir string) int {
	n := 0
	_ = filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil || !d.IsDir() {
			return nil
		}
		select {
		case <-w.done:
			return filepath.SkipAll // closed meanwhile: stop registering
		default:
		}
		if p != dir && skipDir(d.Name()) {
			return filepath.SkipDir
		}
		if w.w.AddWith(p, fsnotify.WithBufferSize(watchBufferSize)) == nil {
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

// inScope reports whether rel passes through a skipped folder below its root. With the whole
// docs folder as a root (".") the first part is an ordinary folder too, so it is checked as well.
func inScope(rel string, whole bool) bool {
	parts := strings.Split(rel, "/")
	if !whole {
		parts = parts[1:] // parts[0] is a configured root
	}
	for _, seg := range parts {
		if skipDir(seg) {
			return false
		}
	}
	return true
}

// walkNew registers a new directory and then walks it: a file made before the watch
// exists is found by the walk, one made after arrives as an event. It runs off the
// loop, and posts the paths back on w.found.
func (w *watcher) walkNew(dir string) {
	w.addTree(dir)
	var paths []string
	_ = filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			if p != dir && skipDir(d.Name()) {
				return filepath.SkipDir
			}
			return nil
		}
		if strings.EqualFold(filepath.Ext(p), ".md") {
			if r, ok := w.rel(p); ok {
				paths = append(paths, r)
			}
		}
		return nil
	})
	select {
	case w.found <- paths:
	case <-w.done:
	}
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
			if !inRoot || !inScope(rel, w.whole) {
				continue
			}
			if ev.Has(fsnotify.Create) {
				if st, err := settings.SafeStat(ev.Name); err == nil && st.IsDir() {
					if !skipDir(filepath.Base(ev.Name)) {
						go w.walkNew(ev.Name)
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
		case paths := <-w.found:
			for _, p := range paths {
				pending[p] = struct{}{}
			}
			if len(paths) > 0 {
				arm()
			}
		case err, ok := <-w.w.Errors:
			if !ok {
				return
			}
			select {
			case <-w.done: // select picks at random: a closed watcher must not rescan
				return
			default:
			}
			// Overflow or any other watcher error: the pending set is no longer
			// trustworthy. Rebuild the watcher and diff the whole tree, off this
			// goroutine, and let closeAsync drain what fsnotify still has to send.
			log.Printf("docs: watch error, rescanning: %v", err)
			w.closeAsync()
			go w.svc.rescanAfterError(w)
			return
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
	// All the file system work happens before the lock, so a big flush cannot block
	// Scan, ReadBatch or shutdown.
	type probe struct {
		path string
		gone bool
		cur  stamp
	}
	probes := make([]probe, 0, len(paths))
	for p := range paths {
		full, err := ResolveMarkdown(docs, p)
		if err != nil {
			continue
		}
		st, err := settings.SafeStat(full)
		if errors.Is(err, fs.ErrNotExist) {
			probes = append(probes, probe{path: p, gone: true})
			continue
		}
		if err != nil || st.IsDir() {
			continue
		}
		probes = append(probes, probe{path: p, cur: stamp{Mtime: st.ModTime().UnixMilli(), Size: st.Size()}})
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, pr := range probes {
		p, cur := pr.path, pr.cur
		if pr.gone {
			_, delivered := s.stamps[p]
			_, announced := s.announced[p]
			if delivered || announced {
				cs.Removed = append(cs.Removed, p)
				delete(s.stamps, p)
				delete(s.announced, p)
			}
			continue
		}
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

// rescanBackoff are the waits between retries when the rescan after an error fails
// (the root is gone, say). A var so tests can shorten it.
var rescanBackoff = []time.Duration{time.Second, 2 * time.Second, 4 * time.Second, 8 * time.Second, 15 * time.Second}

// rescanAfterError runs after a watcher overflow or error. Scan starts a new watcher
// (registering first) and diffs the walk against the stamps. The result goes out as
// a ChangeSet with Rescan set. If Scan fails it is retried with backoff, so the app
// is not left without a watcher. It gives up quietly when another scan has taken
// over (a Settings root change, say), since the newer one owns the watcher and stamps.
func (s *DocsService) rescanAfterError(failing *watcher) {
	expect := failing
	for attempt := 0; ; attempt++ {
		s.mu.Lock()
		stale := s.closed || s.watch != expect
		s.mu.Unlock()
		if stale {
			return
		}
		res, err := s.scan(true)
		if err == nil {
			s.send(ChangeSet{Changed: res.Changed, Removed: res.Removed, Rescan: true})
			return
		}
		if errors.Is(err, errSuperseded) {
			return
		}
		if attempt >= len(rescanBackoff) {
			log.Printf("docs: rescan after watcher error gave up: %v", err)
			return
		}
		log.Printf("docs: rescan after watcher error failed (%v), retrying in %s", err, rescanBackoff[attempt])
		time.Sleep(rescanBackoff[attempt])
		s.mu.Lock()
		expect = s.watch // our own failed attempt may have installed a new watcher
		s.mu.Unlock()
	}
}
