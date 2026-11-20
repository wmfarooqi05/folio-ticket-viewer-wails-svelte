package shell

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"
)

// The runtime-request guard (ticket 16, findings H1 and H2).
//
// Wails v3.1.0 answers every request to /wails/runtime on the desktop with no origin check, and
// its runtime objects include Browser.OpenURL (which shells out to any protocol handler),
// Clipboard, Dialog and Window. Script that ran in a foreign page, or a page script that bypassed
// the sanitiser, could therefore call them. This middleware sits outermost, before Wails' own
// transport, and lets a runtime request through only when
//
//   - it carries Folio's own origin in its Origin header (a page cannot forge Origin; WebView2 does
//     not show Sec-Fetch-Site to this layer, see ticket 16 Q1), and
//   - it is a plain POST whose JSON body names one of the runtime objects Folio's frontend uses.
//
// Folio's frontend uses Call (bound Go methods), Events (docs:changed and mem:changed listeners)
// and CancelCall. Window (6) is not used: the frontend never calls it, and the window title bar
// is native.

// Wails runtime object ids (messageprocessor.go in wails v3.1.0).
const (
	ObjectCall       = 0
	ObjectEvents     = 3
	ObjectCancelCall = 10
)

// AppOrigin is the origin the Wails asset server uses on Windows.
const AppOrigin = "http://wails.localhost"

// maxRuntimeBody caps what the guard buffers; Wails itself chunks anything near 2 MB.
const maxRuntimeBody = 16 << 20

var allowedObjects = map[int]bool{ObjectCall: true, ObjectEvents: true, ObjectCancelCall: true}

// RuntimeGuard rejects /wails/runtime* and /wails/stream/ requests that do not come from one of
// origins, or that call a runtime object outside the allowlist. Everything else passes to next.
func RuntimeGuard(origins ...string) func(http.Handler) http.Handler {
	ok := map[string]bool{}
	for _, o := range origins {
		ok[o] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p := r.URL.Path
			if !strings.HasPrefix(p, "/wails/runtime") && !strings.HasPrefix(p, "/wails/stream/") &&
				!strings.HasPrefix(p, "/wails/eventpayload/") {
				next.ServeHTTP(w, r)
				return
			}
			// runtime.js and the transport scripts are static files for the page to load.
			if r.Method == http.MethodGet && (p == "/wails/runtime.js" || p == "/wails/transport.js") {
				next.ServeHTTP(w, r)
				return
			}
			origin := r.Header.Get("Origin")
			if p != "/wails/runtime" {
				// The stream and event-payload channels carry no runtime object and only hand data
				// to the page. A same-origin GET carries no Origin header, so absent is fine; a
				// foreign one is not.
				if origin != "" && !ok[origin] {
					deny(w, r, "origin")
					return
				}
				next.ServeHTTP(w, r)
				return
			}
			// WebView2 shows the guard the Origin header of a same-origin POST ("http://wails.localhost",
			// measured in the real exe) but not Sec-Fetch-Site, so Origin alone is the check. Q1.
			if !ok[origin] {
				deny(w, r, "origin")
				return
			}
			if r.Method != http.MethodPost || r.Header.Get("x-wails-chunk-id") != "" {
				deny(w, r, "method")
				return
			}
			body, err := io.ReadAll(io.LimitReader(r.Body, maxRuntimeBody+1))
			if err != nil || len(body) > maxRuntimeBody {
				deny(w, r, "body")
				return
			}
			r.Body = io.NopCloser(bytes.NewReader(body)) // Wails reads it again
			var req struct {
				Object *int `json:"object"`
			}
			if json.Unmarshal(body, &req) != nil || req.Object == nil || !allowedObjects[*req.Object] {
				deny(w, r, "object")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func deny(w http.ResponseWriter, r *http.Request, why string) {
	log.Printf("shell: blocked runtime request %s %s (%s)", r.Method, r.URL.Path, why)
	http.Error(w, "forbidden", http.StatusForbidden)
}

// Chain applies middlewares so that the first one listed is outermost.
func Chain(ms ...func(http.Handler) http.Handler) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		for i := len(ms) - 1; i >= 0; i-- {
			next = ms[i](next)
		}
		return next
	}
}
