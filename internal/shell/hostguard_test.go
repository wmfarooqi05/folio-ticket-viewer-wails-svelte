package shell

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// guarded runs one request through the guard. next answers 202 and echoes the body it can still read,
// so a test also proves the body was restored after the guard read it.
func guarded(method, target, origin, body string, hdr map[string]string) (*httptest.ResponseRecorder, string) {
	var seen string
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		seen = string(b)
		w.WriteHeader(http.StatusAccepted)
	})
	h := RuntimeGuard(AppOrigin)(next)
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec, seen
}

func TestRuntimeGuard(t *testing.T) {
	call := `{"object":0,"method":0,"args":{"methodID":1}}`
	cases := []struct {
		name, method, target, origin, body string
		hdr                                map[string]string
		want                               int
	}{
		{"call from the app", "POST", "/wails/runtime", AppOrigin, call, nil, 202},
		{"events from the app", "POST", "/wails/runtime", AppOrigin, `{"object":3,"method":0}`, nil, 202},
		{"cancel call from the app", "POST", "/wails/runtime", AppOrigin, `{"object":10,"method":0}`, nil, 202},
		{"missing origin", "POST", "/wails/runtime", "", call, nil, 403},
		{"foreign origin", "POST", "/wails/runtime", "https://evil.example", call, nil, 403},
		{"null origin", "POST", "/wails/runtime", "null", call, nil, 403},
		{"lookalike origin", "POST", "/wails/runtime", "http://wails.localhost.evil.example", call, nil, 403},
		{"https origin", "POST", "/wails/runtime", "https://wails.localhost", call, nil, 403},
		{"Browser.OpenURL from the right origin", "POST", "/wails/runtime", AppOrigin, `{"object":9,"method":0,"args":{"url":"vscode://x"}}`, nil, 403},
		{"Clipboard", "POST", "/wails/runtime", AppOrigin, `{"object":1,"method":0}`, nil, 403},
		{"Application.Quit", "POST", "/wails/runtime", AppOrigin, `{"object":2,"method":0}`, nil, 403},
		{"Dialog", "POST", "/wails/runtime", AppOrigin, `{"object":5,"method":0}`, nil, 403},
		{"Window", "POST", "/wails/runtime", AppOrigin, `{"object":6,"method":0}`, nil, 403},
		{"System", "POST", "/wails/runtime", AppOrigin, `{"object":8,"method":0}`, nil, 403},
		{"unknown object", "POST", "/wails/runtime", AppOrigin, `{"object":99,"method":0}`, nil, 403},
		{"negative object", "POST", "/wails/runtime", AppOrigin, `{"object":-1,"method":0}`, nil, 403},
		{"no object", "POST", "/wails/runtime", AppOrigin, `{"method":0}`, nil, 403},
		{"object as string", "POST", "/wails/runtime", AppOrigin, `{"object":"9","method":0}`, nil, 403},
		{"not json", "POST", "/wails/runtime", AppOrigin, `object=9`, nil, 403},
		{"empty body, object in the query", "POST", "/wails/runtime?object=0&method=0", AppOrigin, ``, nil, 403},
		{"duplicate key, last one wins like Wails", "POST", "/wails/runtime", AppOrigin, `{"object":0,"object":9}`, nil, 403},
		{"chunked upload", "POST", "/wails/runtime", AppOrigin, call, map[string]string{"x-wails-chunk-id": "a"}, 403},
		{"GET", "GET", "/wails/runtime?object=0&method=0", AppOrigin, ``, nil, 403},
		{"runtime.js without origin", "GET", "/wails/runtime.js", "", ``, nil, 202},
		{"stream without origin (same-origin GET)", "GET", "/wails/stream/x", "", ``, nil, 202},
		{"stream from a foreign origin", "POST", "/wails/stream/x", "https://evil.example", ``, nil, 403},
		{"event payload from a foreign origin", "GET", "/wails/eventpayload/x", "https://evil.example", ``, nil, 403},
		{"runtime path variant is guarded", "POST", "/wails/runtime/x", "https://evil.example", call, nil, 403},
		{"other paths pass", "GET", "/assets/index.js", "", ``, nil, 202},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec, seen := guarded(c.method, c.target, c.origin, c.body, c.hdr)
			if rec.Code != c.want {
				t.Fatalf("%s %s origin=%q body=%q = %d, want %d", c.method, c.target, c.origin, c.body, rec.Code, c.want)
			}
			if c.want == 202 && seen != c.body {
				t.Fatalf("body not restored: next saw %q, want %q", seen, c.body)
			}
		})
	}
}

func TestRuntimeGuardAcceptsDevOrigin(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusAccepted) })
	h := RuntimeGuard(AppOrigin, "http://localhost:9245")(next)
	req := httptest.NewRequest("POST", "/wails/runtime", strings.NewReader(`{"object":0,"method":0}`))
	req.Header.Set("Origin", "http://localhost:9245")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 202 {
		t.Fatalf("dev origin = %d", rec.Code)
	}
}

func TestChainOrder(t *testing.T) {
	var order []string
	mk := func(n string) func(http.Handler) http.Handler {
		return func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				order = append(order, n)
				next.ServeHTTP(w, r)
			})
		}
	}
	Chain(mk("first"), mk("second"))(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		order = append(order, "app")
	})).ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/", nil))
	if strings.Join(order, ",") != "first,second,app" {
		t.Fatalf("order %v", order)
	}
}

func TestDeniedPermissions(t *testing.T) {
	if got := len(DeniedPermissions()); got != 5 {
		t.Fatalf("cross-platform permissions: %d", got)
	}
	m := DeniedWebView2Permissions()
	for k := 1; k <= 12; k++ {
		if m[application.CoreWebView2PermissionKind(k)] != application.CoreWebView2PermissionStateDeny {
			t.Fatalf("kind %d not denied", k)
		}
	}
	if _, ok := m[0]; ok {
		t.Fatal("kind 0 (unknown) should not be listed")
	}
}

func TestDocAssetsNoStore(t *testing.T) {
	// the /doc/ images must not enter the WebView2 HTTP cache (ticket 16, M2)
	base := t.TempDir()
	if err := os.WriteFile(base+"/a.png", []byte("PNG"), 0o644); err != nil {
		t.Fatal(err)
	}
	rec := serve(t, base, "GET", "/doc/a.png")
	if rec.Code != 200 || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("code %d, Cache-Control %q", rec.Code, rec.Header().Get("Cache-Control"))
	}
}
