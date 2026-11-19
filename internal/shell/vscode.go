package shell

import (
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
)

// VSCodeURL builds a vscode://file/ URL for an absolute path and an optional
// 1-based line (0 or less means the top of the file).
//
// Each path segment is escaped with url.PathEscape, so spaces become %20 while the
// drive colon and the slashes stay as they are:
//
//	vscode://file/E:/src/Lockbox%20and%20Cash/docs/modules/x/issues/05-a.md:12
func VSCodeURL(abs string, line int) string {
	segs := strings.Split(filepath.ToSlash(abs), "/")
	for i, s := range segs {
		segs[i] = url.PathEscape(s)
	}
	u := "vscode://file/" + strings.TrimPrefix(strings.Join(segs, "/"), "/")
	if line > 0 {
		u += ":" + strconv.Itoa(line)
	}
	return u
}
