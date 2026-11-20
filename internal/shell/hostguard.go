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

// RuntimeGuard rejects /wails/runtime*, /wails/stream/ and /wails/eventpayload/ requests that do not
// come from one of origins, or that call a runtime object outside the allowlist. Everything else
// passes to next. A chunked call is held back here until it is whole, checked as one JSON document,
// and forwarded as a single ordinary request, so what was checked is exactly what Wails decodes.
func RuntimeGuard(origins ...string) func(http.Handler) http.Handler {
	ok := map[string]bool{}
	for _, o := range origins {
		ok[o] = true
	}
	store := newChunkStore()
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
				whole, status := store.take(id, r)
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

type pendingUpload struct {
	total   int
	chunks  map[int][]byte
	size    int
	created time.Time
}

// chunkStore holds the chunks of calls that are not whole yet. Uploads expire after chunkTTL (each one
// schedules its own removal, so an abandoned upload does not hold memory until the next request), and
// all pending uploads together are capped at maxPendingBytes (Wails' own streams use 128 MiB).
type chunkStore struct {
	mu      sync.Mutex
	pending map[string]*pendingUpload
	bytes   int
	limit   int           // maxPendingBytes; a field so tests can use a small one
	ttl     time.Duration // chunkTTL
}

const maxPendingBytes = 128 << 20

func newChunkStore() *chunkStore {
	return &chunkStore{pending: map[string]*pendingUpload{}, limit: maxPendingBytes, ttl: chunkTTL}
}

// drop removes an upload and frees its bytes. Caller holds mu.
func (c *chunkStore) drop(id string) {
	if u := c.pending[id]; u != nil {
		c.bytes -= u.size
		delete(c.pending, id)
	}
}

// take stores one chunk. It returns the whole body once the last chunk is in. The status is 0 for
// a whole body, 200 for "stored, more to come" and anything else for a refusal.
func (c *chunkStore) take(id string, r *http.Request) ([]byte, int) {
	total, err1 := strconv.Atoi(r.Header.Get("x-wails-chunk-total"))
	index, err2 := strconv.Atoi(r.Header.Get("x-wails-chunk-index"))
	if err1 != nil || err2 != nil || total <= 0 || total > maxChunkTotal || index < 0 || index >= total {
		return nil, http.StatusBadRequest
	}
	chunk, err := io.ReadAll(io.LimitReader(r.Body, maxChunkBody+1))
	if err != nil || len(chunk) > maxChunkBody {
		return nil, http.StatusRequestEntityTooLarge
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now()
	for k, u := range c.pending { // expire stale uploads when a new request arrives, too
		if now.Sub(u.created) > c.ttl {
			c.drop(k)
		}
	}
	u := c.pending[id]
	if u == nil {
		if len(c.pending) >= maxPendingUploads {
			return nil, http.StatusServiceUnavailable
		}
		u = &pendingUpload{total: total, chunks: map[int][]byte{}, created: now}
		c.pending[id] = u
		created := u
		time.AfterFunc(c.ttl+time.Second, func() {
			c.mu.Lock()
			if c.pending[id] == created {
				c.drop(id)
			}
			c.mu.Unlock()
		})
	}
	if u.total != total {
		c.drop(id)
		return nil, http.StatusBadRequest
	}
	delta := len(chunk) - len(u.chunks[index])
	if u.size+delta > maxRuntimeBody || c.bytes+delta > c.limit {
		c.drop(id)
		return nil, http.StatusRequestEntityTooLarge
	}
	u.size += delta
	c.bytes += delta
	u.chunks[index] = chunk
	if len(u.chunks) < u.total {
		return nil, http.StatusOK
	}
	whole := make([]byte, 0, u.size)
	for i := 0; i < u.total; i++ {
		whole = append(whole, u.chunks[i]...)
	}
	c.drop(id)
	return whole, 0
}

// FrameGuard forbids framing Folio's pages. A meta CSP cannot carry frame-ancestors, so the headers
// go on every response the asset middleware sends. The web server does the same (server/security.ts).
func FrameGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy", "frame-ancestors 'none'")
		h.Set("X-Frame-Options", "DENY")
		next.ServeHTTP(w, r)
	})
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
