// Command contract-server is a test harness, not part of the app. It puts the real Go services
// (internal/docs, internal/shell, internal/settings) behind the same HTTP API that the Node
// server speaks (frontend/src/server), so one suite (frontend/contract) can run the same cases
// against both and catch drift between them (ticket 24).
//
//	POST /api/<name>   body: a JSON list of arguments; answer: the result, or {"error": "..."}
//	GET  /api/events   Server-Sent Events, one "docs:changed" event per ChangeSet
//	GET  /doc/<path>   images, through shell.DocAssets
//
// It listens on 127.0.0.1 on a random port and prints "LISTENING <port>". Settings go to -settings;
// the index cache goes under %LOCALAPPDATA% (the test sets it to a temp folder).
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"path/filepath"
	"sync"

	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/docs"
	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/shell"
)

type args []json.RawMessage

func (a args) get(i int, v any) error {
	if i >= len(a) {
		return fmt.Errorf("missing argument %d", i)
	}
	return json.Unmarshal(a[i], v)
}

func main() {
	settingsFile := flag.String("settings", "", "path of settings.json")
	flag.Parse()
	if *settingsFile == "" {
		log.Fatal("contract-server: -settings is required")
	}

	sh := shell.New(*settingsFile)

	var mu sync.Mutex
	clients := map[chan []byte]struct{}{}
	svc := docs.NewService(
		func() docs.Roots { return shell.RootsOf(sh) },
		func(cs docs.ChangeSet) {
			b, _ := json.Marshal(cs)
			mu.Lock()
			defer mu.Unlock()
			for c := range clients {
				select {
				case c <- b:
				default:
				}
			}
		},
	)

	calls := map[string]func(a args) (any, error){
		"getConfig": func(a args) (any, error) { return sh.GetConfig() },
		"setConfig": func(a args) (any, error) {
			var p shell.ConfigPatch
			if err := a.get(0, &p); err != nil {
				return nil, err
			}
			return sh.SetConfig(p)
		},
		"setSidebarWidth": func(a args) (any, error) {
			var n int
			if err := a.get(0, &n); err != nil {
				return nil, err
			}
			return sh.SetSidebarWidth(n)
		},
		"setPanelWidth": func(a args) (any, error) {
			var n int
			if err := a.get(0, &n); err != nil {
				return nil, err
			}
			return sh.SetPanelWidth(n)
		},
		"setSidebarCollapsed": func(a args) (any, error) {
			var b bool
			if err := a.get(0, &b); err != nil {
				return nil, err
			}
			return sh.SetSidebarCollapsed(b)
		},
		"checkRoot": func(a args) (any, error) {
			var s string
			if err := a.get(0, &s); err != nil {
				return nil, err
			}
			return sh.CheckRoot(s)
		},
		"checkDocs": func(a args) (any, error) {
			var r, d string
			var roots []string
			if err := a.get(0, &r); err != nil {
				return nil, err
			}
			if err := a.get(1, &d); err != nil {
				return nil, err
			}
			if err := a.get(2, &roots); err != nil {
				return nil, err
			}
			return sh.CheckDocs(r, d, roots)
		},
		"vscodeUrl": func(a args) (any, error) {
			var p string
			var line int
			if err := a.get(0, &p); err != nil {
				return nil, err
			}
			_ = a.get(1, &line)
			full, err := docs.ResolveMarkdown(shell.RootsOf(sh).Docs, p)
			if err != nil {
				return nil, err
			}
			abs, err := filepath.Abs(full)
			if err != nil {
				return nil, err
			}
			return shell.VSCodeURL(abs, line), nil
		},
		"scan":   func(a args) (any, error) { return svc.Scan() },
		"rescan": func(a args) (any, error) { return svc.Rescan() },
		"readFile": func(a args) (any, error) {
			var p string
			if err := a.get(0, &p); err != nil {
				return nil, err
			}
			return svc.ReadFile(p)
		},
		"readBatch": func(a args) (any, error) {
			var ps []string
			if err := a.get(0, &ps); err != nil {
				return nil, err
			}
			return svc.ReadBatch(ps)
		},
		"loadCache": func(a args) (any, error) {
			var v string
			if err := a.get(0, &v); err != nil {
				return nil, err
			}
			return svc.LoadCache(v)
		},
		"saveCache": func(a args) (any, error) {
			var v string
			var idx json.RawMessage
			if err := a.get(0, &v); err != nil {
				return nil, err
			}
			if err := a.get(1, &idx); err != nil {
				return nil, err
			}
			return nil, svc.SaveCache(v, idx)
		},
		"logTimings": func(a args) (any, error) { return nil, nil },
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/events", func(w http.ResponseWriter, r *http.Request) {
		fl := w.(http.Flusher)
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(200)
		fmt.Fprint(w, ": folio\n\n")
		fl.Flush()
		c := make(chan []byte, 64)
		mu.Lock()
		clients[c] = struct{}{}
		mu.Unlock()
		defer func() {
			mu.Lock()
			delete(clients, c)
			mu.Unlock()
		}()
		for {
			select {
			case b := <-c:
				fmt.Fprintf(w, "event: %s\ndata: %s\n\n", docs.ChangedEvent, b)
				fl.Flush()
			case <-r.Context().Done():
				return
			}
		}
	})
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		name := r.URL.Path[len("/api/"):]
		call, ok := calls[name]
		w.Header().Set("Content-Type", "application/json")
		if !ok || r.Method != http.MethodPost {
			w.WriteHeader(404)
			return
		}
		body, _ := io.ReadAll(r.Body)
		var a args
		if len(body) > 0 {
			if err := json.Unmarshal(body, &a); err != nil {
				w.WriteHeader(400)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
				return
			}
		}
		out, err := call(a)
		if err != nil {
			w.WriteHeader(400)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		_ = json.NewEncoder(w).Encode(out)
	})
	// The same middleware the desktop app mounts; anything else is a 404.
	handler := shell.DocAssets(func() string { return shell.RootsOf(sh).Docs })(mux)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("LISTENING %d\n", ln.Addr().(*net.TCPAddr).Port)
	log.Fatal(http.Serve(ln, handler))
}
