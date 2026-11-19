package main

import (
	"errors"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// MdFile describes one markdown file under the chosen root.
type MdFile struct {
	Path  string `json:"path"`  // relative, forward slashes
	Size  int64  `json:"size"`  // bytes
	Mtime int64  `json:"mtime"` // unix ms
}

// FileService is registered as a Wails service; its exported methods become TS bindings.
type FileService struct {
	mu      sync.Mutex
	watcher *fsnotify.Watcher
}

// InitialRoot returns the TICKET_ROOT env var (prototype fallback for automation).
func (f *FileService) InitialRoot() string { return os.Getenv("TICKET_ROOT") }

// PickFolder opens the native folder dialog and returns the absolute path ("" if cancelled).
func (f *FileService) PickFolder() (string, error) {
	return application.Get().Dialog.OpenFile().
		CanChooseDirectories(true).CanChooseFiles(false).
		SetTitle("Choose ticket repo root").PromptForSingleSelection()
}

// ListMarkdown walks root and returns every *.md file.
func (f *FileService) ListMarkdown(root string) ([]MdFile, error) {
	start := time.Now()
	out := []MdFile{}
	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			n := d.Name()
			if n == "node_modules" || (strings.HasPrefix(n, ".") && p != root) {
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
		rel, _ := filepath.Rel(root, p)
		out = append(out, MdFile{Path: filepath.ToSlash(rel), Size: info.Size(), Mtime: info.ModTime().UnixMilli()})
		return nil
	})
	log.Printf("ListMarkdown: %d files in %s", len(out), time.Since(start))
	return out, err
}

// ReadFile returns the text of root/rel, refusing paths that escape root.
func (f *FileService) ReadFile(root, rel string) (string, error) {
	full := filepath.Join(root, filepath.FromSlash(rel))
	r, err := filepath.Rel(root, full)
	if err != nil || strings.HasPrefix(r, "..") {
		return "", errors.New("path escapes root")
	}
	b, err := os.ReadFile(full)
	return string(b), err
}

func addTree(w *fsnotify.Watcher, dir string) {
	filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err == nil && d.IsDir() {
			n := d.Name()
			if n == "node_modules" || (strings.HasPrefix(n, ".") && p != dir) {
				return filepath.SkipDir
			}
			w.Add(p)
		}
		return nil
	})
}

// Watch recursively watches root and emits "file:changed" (relative path) for .md changes.
func (f *FileService) Watch(root string) error {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	f.mu.Lock()
	if f.watcher != nil {
		f.watcher.Close()
	}
	f.watcher = w
	f.mu.Unlock()
	start := time.Now()
	addTree(w, root)
	log.Printf("Watch: tree registered in %s", time.Since(start))
	app := application.Get()
	go func() {
		for {
			select {
			case ev, ok := <-w.Events:
				if !ok {
					return
				}
				if ev.Has(fsnotify.Create) {
					if st, err := os.Stat(ev.Name); err == nil && st.IsDir() {
						addTree(w, ev.Name)
						continue
					}
				}
				if !strings.EqualFold(filepath.Ext(ev.Name), ".md") {
					continue
				}
				rel, err := filepath.Rel(root, ev.Name)
				if err != nil {
					continue
				}
				rel = filepath.ToSlash(rel)
				log.Printf("file:changed %s (%s)", rel, ev.Op)
				app.Event.Emit("file:changed", rel)
			case err, ok := <-w.Errors:
				if !ok {
					return
				}
				log.Printf("watch error: %v", err)
			}
		}
	}()
	return nil
}

// LogUI lets the frontend write a line to the Go log (proves UI received an event).
func (f *FileService) LogUI(msg string) { log.Printf("UI: %s", msg) }
