package shell

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// chunkServer is a guard in front of a handler that records what it was sent.
type chunkServer struct {
	h     http.Handler
	calls atomic.Int32
	last  string
	chunk string // the chunk header Wails would have seen on the last forwarded request
}

func newChunkServer() *chunkServer {
	c := &chunkServer{}
	c.h = RuntimeGuard(AppOrigin)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		c.last, c.chunk = string(b), r.Header.Get("x-wails-chunk-id")
		c.calls.Add(1)
		w.WriteHeader(http.StatusAccepted)
	}))
	return c
}

func (c *chunkServer) send(id string, index, total int, body string) int {
	req := httptest.NewRequest("POST", "/wails/runtime", strings.NewReader(body))
	req.Header.Set("Origin", AppOrigin)
	req.Header.Set("x-wails-chunk-id", id)
	req.Header.Set("x-wails-chunk-index", fmt.Sprint(index))
	req.Header.Set("x-wails-chunk-total", fmt.Sprint(total))
	rec := httptest.NewRecorder()
	c.h.ServeHTTP(rec, req)
	return rec.Code
}

func TestChunkedCallIsReassembledAndForwardedWhole(t *testing.T) {
	// a Call over 512 KiB: this is what SaveCache sends for a few hundred documents
	big := `{"object":0,"method":0,"args":{"index":"` + strings.Repeat("x", 600*1024) + `"}}`
	half := len(big) / 2
	c := newChunkServer()
	if got := c.send("a", 0, 2, big[:half]); got != 200 {
		t.Fatalf("first chunk = %d", got)
	}
	if c.calls.Load() != 0 {
		t.Fatal("a middle chunk must not reach Wails")
	}
	if got := c.send("a", 1, 2, big[half:]); got != 202 {
		t.Fatalf("last chunk = %d", got)
	}
	if c.calls.Load() != 1 || c.last != big {
		t.Fatalf("forwarded %d requests, body intact: %v", c.calls.Load(), c.last == big)
	}
	if c.chunk != "" {
		t.Fatal("the forwarded request must not carry chunk headers")
	}
}

func TestChunkedCallOutOfOrder(t *testing.T) {
	body := `{"object":0,"method":0,"args":{"a":"` + strings.Repeat("y", 100) + `"}}`
	c := newChunkServer()
	c.send("b", 1, 2, body[50:])
	if got := c.send("b", 0, 2, body[:50]); got != 202 || c.last != body {
		t.Fatalf("got %d, body intact %v", got, c.last == body)
	}
}

func TestChunkedCallChecksTheAssembledObject(t *testing.T) {
	// chunk 0 looks like a Call, but a duplicate "object" key in the last chunk wins when decoded
	c := newChunkServer()
	c.send("d", 0, 2, `{"object":0,"method":0,"args":{"x":1},`)
	if got := c.send("d", 1, 2, `"object":9}`); got != 403 {
		t.Fatalf("assembled object 9 = %d, want 403", got)
	}
	if c.calls.Load() != 0 {
		t.Fatal("nothing may reach Wails")
	}
}

func TestChunkedCallRefusals(t *testing.T) {
	c := newChunkServer()
	cases := []struct {
		name         string
		id           string
		index, total int
		body         string
		want         int
	}{
		{"total zero", "e1", 0, 0, "{}", 403},
		{"total over 1024", "e2", 0, 1025, "{}", 403},
		{"index at total", "e3", 2, 2, "{}", 403},
		{"negative index", "e4", -1, 2, "{}", 403},
		{"chunk over 1 MiB", "e5", 0, 2, strings.Repeat("z", 1<<20+1), 403},
	}
	for _, k := range cases {
		if got := c.send(k.id, k.index, k.total, k.body); got != k.want {
			t.Errorf("%s: %d, want %d", k.name, got, k.want)
		}
	}
	// the total must not change between chunks
	c.send("f", 0, 2, "{")
	if got := c.send("f", 1, 3, "}"); got != 403 {
		t.Errorf("inconsistent total = %d", got)
	}
	// a foreign origin is refused before any chunk is stored
	req := httptest.NewRequest("POST", "/wails/runtime", strings.NewReader("{}"))
	req.Header.Set("Origin", "https://evil.example")
	req.Header.Set("x-wails-chunk-id", "g")
	req.Header.Set("x-wails-chunk-index", "0")
	req.Header.Set("x-wails-chunk-total", "1")
	rec := httptest.NewRecorder()
	c.h.ServeHTTP(rec, req)
	if rec.Code != 403 || c.calls.Load() != 0 {
		t.Errorf("foreign chunk = %d, forwarded %d", rec.Code, c.calls.Load())
	}
}

func TestChunkedCallAssembledLimit(t *testing.T) {
	c := newChunkServer()
	chunk := strings.Repeat("a", 1<<20)
	var last int
	for i := 0; i < 65; i++ { // 65 MiB against the 64 MiB cap
		last = c.send("h", i, 100, chunk)
		if last != 200 {
			break
		}
	}
	if last != 403 {
		t.Fatalf("over the assembled cap = %d, want 403", last)
	}
}

func TestGuardRunsAheadOfTheNextHandler(t *testing.T) {
	// The chain main.go builds: guard first, then DocAssets, then Wails' own handlers (here, a stub that
	// counts). A hostile runtime call must be refused before anything after the guard sees it.
	var reached atomic.Int32
	wails := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { reached.Add(1) })
	h := Chain(RuntimeGuard(AppOrigin), DocAssets(func() string { return t.TempDir() }))(wails)
	for _, body := range []string{`{"object":9,"method":0}`, `{"object":1,"method":0}`} {
		req := httptest.NewRequest("POST", "/wails/runtime", strings.NewReader(body))
		req.Header.Set("Origin", AppOrigin)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != 403 {
			t.Fatalf("%s = %d", body, rec.Code)
		}
	}
	if reached.Load() != 0 {
		t.Fatal("a refused call reached the handlers behind the guard")
	}
	req := httptest.NewRequest("POST", "/wails/runtime", strings.NewReader(`{"object":0,"method":0}`))
	req.Header.Set("Origin", AppOrigin)
	h.ServeHTTP(httptest.NewRecorder(), req)
	if reached.Load() != 1 {
		t.Fatal("an allowed call must reach them")
	}
}

func TestHardenSetsEveryPolicy(t *testing.T) {
	// what main.go hands to the window is what is checked here
	o := Harden(application.WebviewWindowOptions{Title: "x"})
	if !o.DefaultContextMenuDisabled || o.Title != "x" {
		t.Fatalf("context menu %v, title %q", o.DefaultContextMenuDisabled, o.Title)
	}
	for _, p := range []application.PermissionType{
		application.PermissionMicrophone, application.PermissionCamera, application.PermissionGeolocation,
		application.PermissionNotifications, application.PermissionClipboardRead,
	} {
		if o.Permissions[p] != application.PermissionDeny {
			t.Errorf("cross-platform permission %d not denied", p)
		}
	}
	for k := 0; k <= 12; k++ {
		if o.Windows.Permissions[application.CoreWebView2PermissionKind(k)] != application.CoreWebView2PermissionStateDeny {
			t.Errorf("WebView2 kind %d not denied", k)
		}
	}
}

func TestDevOrigin(t *testing.T) {
	cases := map[string]string{
		"http://localhost:9245":  "http://wails.localhost:9245",
		"http://localhost:9245/": "http://wails.localhost:9245",
		"http://127.0.0.1:5173":  "http://wails.localhost:5173",
		"http://localhost":       "",
		"":                       "",
		"::bad":                  "",
	}
	for in, want := range cases {
		if got := DevOrigin(in); got != want {
			t.Errorf("DevOrigin(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestRuntimeGuardAcceptsDevOrigin(t *testing.T) {
	dev := DevOrigin("http://localhost:9245")
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusAccepted) })
	h := RuntimeGuard(dev)(next)
	for origin, want := range map[string]int{dev: 202, "http://localhost:9245": 403, AppOrigin: 403} {
		req := httptest.NewRequest("POST", "/wails/runtime", strings.NewReader(`{"object":0,"method":0}`))
		req.Header.Set("Origin", origin)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != want {
			t.Errorf("origin %q = %d, want %d", origin, rec.Code, want)
		}
	}
}
