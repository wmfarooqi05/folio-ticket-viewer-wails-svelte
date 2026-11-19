package shell

import (
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/docs"
)

// DocAssetPrefix is the URL prefix the renderer uses for images that live in the docs
// folder: <img src="/doc/modules/x/evidence/a.png">. Ticket 10, 06 D6.
const DocAssetPrefix = "/doc/"

// imageTypes is the whole list of files the handler serves. Anything else is a 404.
var imageTypes = map[string]string{
	".png":  "image/png",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".gif":  "image/gif",
	".webp": "image/webp",
	".svg":  "image/svg+xml",
}

// DocAssets returns an asset-server middleware that serves images from the docs root
// under /doc/<docs-relative path>. It is read-only (GET and HEAD), serves image
// extensions only, and refuses any path that leaves the root (docs.SafeJoin, which also
// rejects symlinks pointing outside). Every other request goes to next.
//
// root is called on each request, so a root change in settings applies at once.
func DocAssets(root func() string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !strings.HasPrefix(r.URL.Path, DocAssetPrefix) {
				next.ServeHTTP(w, r)
				return
			}
			if r.Method != http.MethodGet && r.Method != http.MethodHead {
				w.Header().Set("Allow", "GET, HEAD")
				http.Error(w, "read-only", http.StatusMethodNotAllowed)
				return
			}
			rel := strings.TrimPrefix(r.URL.Path, DocAssetPrefix)
			ctype, ok := imageTypes[strings.ToLower(path.Ext(rel))]
			if !ok {
				http.NotFound(w, r)
				return
			}
			full, err := docs.SafeJoin(root(), rel)
			if err != nil {
				http.NotFound(w, r)
				return
			}
			// the file must resolve, and resolve to somewhere inside the root (symlinks, junctions)
			realFull, err := filepath.EvalSymlinks(full)
			realRoot, rerr := filepath.EvalSymlinks(root())
			if err != nil || rerr != nil || !within(realRoot, realFull) {
				http.NotFound(w, r)
				return
			}
			f, err := os.Open(realFull)
			if err != nil {
				http.NotFound(w, r)
				return
			}
			defer f.Close()
			st, err := f.Stat()
			if err != nil || !st.Mode().IsRegular() {
				http.NotFound(w, r)
				return
			}
			h := w.Header()
			h.Set("Content-Type", ctype)
			h.Set("X-Content-Type-Options", "nosniff")
			// An SVG opened as a document must not run anything.
			h.Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
			h.Set("Cache-Control", "no-cache")
			http.ServeContent(w, r, "", st.ModTime(), f)
		})
	}
}

func within(root, p string) bool {
	rel, err := filepath.Rel(root, p)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}
