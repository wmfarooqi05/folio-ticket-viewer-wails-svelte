package shell

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func chunkReq(id string, index, total int, body string) *http.Request {
	req := httptest.NewRequest("POST", "/wails/runtime", strings.NewReader(body))
	req.Header.Set("x-wails-chunk-id", id)
	req.Header.Set("x-wails-chunk-index", fmt.Sprint(index))
	req.Header.Set("x-wails-chunk-total", fmt.Sprint(total))
	return req
}

func TestChunkStoreGlobalByteCap(t *testing.T) {
	// many half-sent uploads must not add up to unbounded memory
	s := newChunkStore()
	s.limit = 100
	for i := 0; i < 2; i++ {
		id := fmt.Sprint("u", i)
		if _, st := s.take(id, chunkReq(id, 0, 2, strings.Repeat("a", 40))); st != 200 {
			t.Fatalf("upload %d = %d", i, st)
		}
	}
	if _, st := s.take("u2", chunkReq("u2", 0, 2, strings.Repeat("a", 40))); st != http.StatusRequestEntityTooLarge {
		t.Fatalf("third upload over the cap = %d", st)
	}
	if s.bytes != 80 || len(s.pending) != 2 {
		t.Fatalf("bytes %d, pending %d: the refused upload must not be kept", s.bytes, len(s.pending))
	}
	// finishing one frees its bytes
	if whole, st := s.take("u0", chunkReq("u0", 1, 2, strings.Repeat("b", 10))); st != 0 || len(whole) != 50 {
		t.Fatalf("finish = %d, %d bytes", st, len(whole))
	}
	if s.bytes != 40 {
		t.Fatalf("bytes after finishing = %d, want 40", s.bytes)
	}
}

func TestChunkStoreExpiresAbandonedUploads(t *testing.T) {
	s := newChunkStore()
	s.ttl = 50 * time.Millisecond
	s.take("abandoned", chunkReq("abandoned", 0, 3, "xxxx"))
	time.Sleep(1300 * time.Millisecond) // ttl plus the timer's one-second grace; no further request arrives
	s.mu.Lock()
	n, b := len(s.pending), s.bytes
	s.mu.Unlock()
	if n != 0 || b != 0 {
		t.Fatalf("pending %d, bytes %d: an abandoned upload must be freed without another request", n, b)
	}
}

func TestFrameGuardHeaders(t *testing.T) {
	h := FrameGuard(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) }))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
	if rec.Header().Get("Content-Security-Policy") != "frame-ancestors 'none'" || rec.Header().Get("X-Frame-Options") != "DENY" {
		t.Fatalf("headers %v", rec.Header())
	}
}
