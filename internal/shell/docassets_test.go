package shell

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func serve(t *testing.T, root, method, target string) *httptest.ResponseRecorder {
	t.Helper()
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTeapot) // marks "fell through to the app assets"
	})
	h := DocAssets(func() string { return root })(next)
	req := httptest.NewRequest(method, target, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestDocAssets(t *testing.T) {
	base := t.TempDir()
	root := filepath.Join(base, "docs")
	if err := os.MkdirAll(filepath.Join(root, "modules", "a", "evidence"), 0o755); err != nil {
		t.Fatal(err)
	}
	write := func(p, body string) {
		if err := os.WriteFile(filepath.Join(base, filepath.FromSlash(p)), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("docs/modules/a/evidence/shot.png", "PNGDATA")
	write("docs/modules/a/ticket.md", "# secret")
	write("docs/modules/a/notes.txt", "text")
	write("secret.png", "OUTSIDE") // a sibling of the docs root

	cases := []struct {
		name, method, target string
		want                 int
	}{
		{"image is served", "GET", "/doc/modules/a/evidence/shot.png", 200},
		{"head is allowed", "HEAD", "/doc/modules/a/evidence/shot.png", 200},
		{"markdown is refused", "GET", "/doc/modules/a/ticket.md", 404},
		{"text is refused", "GET", "/doc/modules/a/notes.txt", 404},
		{"missing image", "GET", "/doc/modules/a/evidence/none.png", 404},
		{"dotdot to a real image outside", "GET", "/doc/../secret.png", 404},
		{"dotdot inside the tree", "GET", "/doc/modules/a/../a/evidence/shot.png", 404},
		{"encoded dotdot", "GET", "/doc/%2e%2e/secret.png", 404},
		{"backslash dotdot", "GET", "/doc/..%5Csecret.png", 404},
		{"absolute path", "GET", "/doc//secret.png", 404},
		{"drive letter", "GET", "/doc/C:/Windows/win.png", 404},
		{"directory named like an image", "GET", "/doc/modules/a/dir.png", 404},
		{"post is refused", "POST", "/doc/modules/a/evidence/shot.png", 405},
		{"put is refused", "PUT", "/doc/modules/a/evidence/shot.png", 405},
		{"delete is refused", "DELETE", "/doc/modules/a/evidence/shot.png", 405},
		{"other urls fall through", "GET", "/assets/index.js", http.StatusTeapot},
		{"root falls through", "GET", "/", http.StatusTeapot},
	}
	if err := os.Mkdir(filepath.Join(root, "modules", "a", "dir.png"), 0o755); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := serve(t, root, c.method, c.target)
			if rec.Code != c.want {
				t.Fatalf("%s %s = %d, want %d (body %q)", c.method, c.target, rec.Code, c.want, rec.Body.String())
			}
		})
	}

	t.Run("served bytes and headers", func(t *testing.T) {
		rec := serve(t, root, "GET", "/doc/modules/a/evidence/shot.png")
		if rec.Body.String() != "PNGDATA" || rec.Header().Get("Content-Type") != "image/png" {
			t.Fatalf("body %q type %q", rec.Body.String(), rec.Header().Get("Content-Type"))
		}
		if rec.Header().Get("X-Content-Type-Options") != "nosniff" {
			t.Fatal("missing nosniff")
		}
	})

	t.Run("no root configured", func(t *testing.T) {
		if rec := serve(t, "", "GET", "/doc/modules/a/evidence/shot.png"); rec.Code != 404 {
			t.Fatalf("got %d", rec.Code)
		}
	})

	t.Run("symlink out of the root", func(t *testing.T) {
		link := filepath.Join(root, "modules", "a", "evidence", "link.png")
		if err := os.Symlink(filepath.Join(base, "secret.png"), link); err != nil {
			t.Skipf("cannot create a symlink here: %v", err)
		}
		if rec := serve(t, root, "GET", "/doc/modules/a/evidence/link.png"); rec.Code != 404 {
			t.Fatalf("symlink escape served: %d", rec.Code)
		}
	})
}
