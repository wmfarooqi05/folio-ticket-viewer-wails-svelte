package shell

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
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

// The limits below are Wails v3.1.0's own (transport_http.go): the runtime splits a call whose JSON is
// over 524288 characters into chunks, and the guard has to reassemble them to see the object.
const (
	maxRuntimeBody    = 64 << 20 // maxAssembledBytes
	maxChunkBody      = 1 << 20  // maxChunkBodyBytes
	maxChunkTotal     = 1024
	chunkTTL          = 30 * time.Second
	maxPendingUploads = 64
)

var allowedObjects = map[int]bool{ObjectCall: true, ObjectEvents: true, ObjectCancelCall: true}

type pendingUpload struct {
	total   int
	chunks  map[int][]byte
	size    int
	created time.Time
}

// RuntimeGuard rejects /wails/runtime*, /wails/stream/ and /wails/eventpayload/ requests that do not
// come from one of origins, or that call a runtime object outside the allowlist. Everything else
// passes to next. A chunked call is held back here until it is whole, checked as one JSON document,
// and forwarded as a single ordinary request, so what was checked is exactly what Wails decodes.
func RuntimeGuard(origins ...string) func(http.Handler) http.Handler {
	ok := map[string]bool{}
	for _, o := range origins {
		ok[o] = true
	}
	var mu sync.Mutex
	pending := map[string]*pendingUpload{}
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
				// The stream and event-payload channels carry no runtime object. A same-origin GET
				// or HEAD carries no Origin header, so absent is fine for those; a foreign one is
				// not, and anything that can write must carry Folio's exact origin.
				readOnly := r.Method == http.MethodGet || r.Method == http.MethodHead
				if (readOnly && origin != "" && !ok[origin]) || (!readOnly && !ok[origin]) {
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
			if r.Method != http.MethodPost {
				deny(w, r, "method")
				return
			}
			var body []byte
			if id := r.Header.Get("x-wails-chunk-id"); id != "" {
				whole, status := takeChunk(&mu, pending, id, r)
				if status != 0 {
					if status == http.StatusOK {
						w.WriteHeader(http.StatusOK) // a middle chunk: Wails answers 200 and waits
						return
					}
					deny(w, r, "chunk")
					return
				}
				body = whole
				// forward one ordinary request: no chunk headers, so Wails does not wait for more
				r.Header.Del("x-wails-chunk-id")
				r.Header.Del("x-wails-chunk-index")
				r.Header.Del("x-wails-chunk-total")
			} else {
				var err error
				body, err = io.ReadAll(io.LimitReader(r.Body, maxRuntimeBody+1))
				if err != nil || len(body) > maxRuntimeBody {
					deny(w, r, "body")
					return
				}
			}
			var req struct {
				Object *int `json:"object"`
			}
			if json.Unmarshal(body, &req) != nil || req.Object == nil || !allowedObjects[*req.Object] {
				deny(w, r, "object")
				return
			}
			r.Body = io.NopCloser(bytes.NewReader(body)) // Wails reads it again
			r.ContentLength = int64(len(body))
			next.ServeHTTP(w, r)
		})
	}
}

// takeChunk stores one chunk. It returns the whole body once the last chunk is in. The status is 0 for
// a whole body, 200 for "stored, more to come" and anything else for a refusal.
func takeChunk(mu *sync.Mutex, pending map[string]*pendingUpload, id string, r *http.Request) ([]byte, int) {
	total, err1 := strconv.Atoi(r.Header.Get("x-wails-chunk-total"))
	index, err2 := strconv.Atoi(r.Header.Get("x-wails-chunk-index"))
	if err1 != nil || err2 != nil || total <= 0 || total > maxChunkTotal || index < 0 || index >= total {
		return nil, http.StatusBadRequest
	}
	chunk, err := io.ReadAll(io.LimitReader(r.Body, maxChunkBody+1))
	if err != nil || len(chunk) > maxChunkBody {
		return nil, http.StatusRequestEntityTooLarge
	}
	mu.Lock()
	defer mu.Unlock()
	now := time.Now()
	for k, u := range pending { // expire stale uploads, as Wails does
		if now.Sub(u.created) > chunkTTL {
			delete(pending, k)
		}
	}
	u := pending[id]
	if u == nil {
		if len(pending) >= maxPendingUploads {
			return nil, http.StatusServiceUnavailable
		}
		u = &pendingUpload{total: total, chunks: map[int][]byte{}, created: now}
		pending[id] = u
	}
	if u.total != total {
		delete(pending, id)
		return nil, http.StatusBadRequest
	}
	u.size += len(chunk) - len(u.chunks[index])
	u.chunks[index] = chunk
	if u.size > maxRuntimeBody {
		delete(pending, id)
		return nil, http.StatusRequestEntityTooLarge
	}
	if len(u.chunks) < u.total {
		return nil, http.StatusOK
	}
	delete(pending, id)
	whole := make([]byte, 0, u.size)
	for i := 0; i < u.total; i++ {
		whole = append(whole, u.chunks[i]...)
	}
	return whole, 0
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
