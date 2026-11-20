package shell

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
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
		{"HEAD", "HEAD", "/wails/runtime", AppOrigin, ``, nil, 403},
		{"PUT", "PUT", "/wails/runtime", AppOrigin, call, nil, 403},
		{"OPTIONS", "OPTIONS", "/wails/runtime", AppOrigin, ``, nil, 403},
		{"DELETE", "DELETE", "/wails/runtime", AppOrigin, call, nil, 403},
		{"Object key in another case is read like Wails reads it", "POST", "/wails/runtime", AppOrigin, `{"Object":9,"method":0}`, nil, 403},
		{"uppercase OBJECT call is the same call", "POST", "/wails/runtime", AppOrigin, `{"OBJECT":0,"method":0}`, nil, 202},
		{"stream HEAD without origin", "HEAD", "/wails/stream/x", "", ``, nil, 202},
		{"stream POST without origin", "POST", "/wails/stream/x", "", ``, nil, 403},
		{"stream POST from the app", "POST", "/wails/stream/x", AppOrigin, ``, nil, 202},
		{"event payload DELETE without origin", "DELETE", "/wails/eventpayload/x", "", ``, nil, 403},
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
