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

// watcher is a recursive fsnotify watcher over the configured roots. It emits
// ChangeSets, judged by stat at flush time.
//
// TODO(ticket 05, D3): new directories are added and walked here, but a full
// production pass is still pending: overflow handling beyond a Rescan flag, a
// wired Rescan command, and measurements on the slow VM.
type watcher struct {
	w    *fsnotify.Watcher
	docs string
	emit func(ChangeSet)
	done chan struct{}
	once sync.Once
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
	w, err := newWatcher(r, s.emit)
	if err != nil {
		log.Printf("docs: watcher not started: %v", err)
		return
	}
	s.watch = w
}

func newWatcher(r Roots, emit func(ChangeSet)) (*watcher, error) {
	fw, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}
	w := &watcher{w: fw, docs: r.Docs, emit: emit, done: make(chan struct{})}
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
func (w *watcher) addTree(dir string) int {
	n := 0
	_ = filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil || !d.IsDir() {
			return nil
		}
		if p != dir && skipDir(d.Name()) {
			return filepath.SkipDir
		}
		if w.w.Add(p) == nil {
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

func (w *watcher) loop() {
	pending := map[string]struct{}{}
	rescan := false
	var quiet, forced <-chan time.Time

	flush := func() {
		quiet, forced = nil, nil
		cs := ChangeSet{Changed: []string{}, Removed: []string{}, Rescan: rescan}
		for p := range pending {
			if _, err := os.Stat(filepath.Join(w.docs, filepath.FromSlash(p))); errors.Is(err, fs.ErrNotExist) {
				cs.Removed = append(cs.Removed, p)
			} else {
				cs.Changed = append(cs.Changed, p)
			}
		}
		slices.Sort(cs.Changed)
		slices.Sort(cs.Removed)
		pending, rescan = map[string]struct{}{}, false
		if len(cs.Changed) > 0 || len(cs.Removed) > 0 || cs.Rescan {
			log.Printf("docs: %s changed=%d removed=%d rescan=%v", ChangedEvent, len(cs.Changed), len(cs.Removed), cs.Rescan)
			w.emit(cs)
		}
	}
	arm := func() {
		quiet = time.After(debounceQuiet)
		if forced == nil {
			forced = time.After(debounceMax)
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
			if ev.Has(fsnotify.Create) {
				if st, err := os.Stat(ev.Name); err == nil && st.IsDir() {
					if !skipDir(filepath.Base(ev.Name)) {
						w.addTree(ev.Name)
						// Files may have landed before the directory was registered.
						_ = filepath.WalkDir(ev.Name, func(p string, d fs.DirEntry, err error) error {
							if err == nil && !d.IsDir() && strings.EqualFold(filepath.Ext(p), ".md") {
								if rel, ok := w.rel(p); ok {
									pending[rel] = struct{}{}
								}
							}
							return nil
						})
						arm()
					}
					continue
				}
			}
			if !strings.EqualFold(filepath.Ext(ev.Name), ".md") {
				continue
			}
			if rel, ok := w.rel(ev.Name); ok {
				pending[rel] = struct{}{}
				arm()
			}
		case err, ok := <-w.w.Errors:
			if !ok {
				return
			}
			log.Printf("docs: watch error: %v", err)
			rescan = true
			arm()
		case <-quiet:
			flush()
		case <-forced:
			flush()
		}
	}
}
