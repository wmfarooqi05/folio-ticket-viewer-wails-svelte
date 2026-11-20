//go:build bench

package shell

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestTakeBenchCommands(t *testing.T) {
	dir := t.TempDir()
	if got := TakeBenchCommands(dir); got != nil {
		t.Fatalf("no file: got %v", got)
	}
	body := "open modules/a/map.md\npanel handoffs/x.md\nopen ../secret.md\nopen C:/x.md\nopen \\\\srv\\x\nrun calc.exe\nopen /abs.md\nopen\n"
	if err := os.WriteFile(filepath.Join(dir, "cmd.txt"), []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	want := []BenchCommand{{"bench:open", "modules/a/map.md"}, {"bench:panel", "handoffs/x.md"}}
	if got := TakeBenchCommands(dir); !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v want %v", got, want)
	}
	if _, err := os.Stat(filepath.Join(dir, "cmd.txt")); !os.IsNotExist(err) {
		t.Fatal("cmd.txt should have been claimed")
	}
	if got := TakeBenchCommands(dir); got != nil {
		t.Fatalf("second take: got %v", got)
	}
}

func TestStartBenchOffByDefault(t *testing.T) {
	t.Setenv(EnvBench, "")
	called := false
	StartBench(func(string, string) { called = true })
	if called {
		t.Fatal("emit called with the hook off")
	}
}
