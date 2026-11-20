package paths

import (
	"path/filepath"
	"testing"
)

func TestWebView2DirIsUnderLocalAppData(t *testing.T) {
	t.Setenv("LOCALAPPDATA", filepath.Join("C:", "Users", "x", "AppData", "Local"))
	got, err := WebView2Dir()
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join("C:", "Users", "x", "AppData", "Local", "Folio", "WebView2")
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}
