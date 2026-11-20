package shell

import (
	"bufio"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// The bench hook (ticket 15). scripts/ram-check.ps1 has to open documents in the real exe to measure
// RAM, and the UI has no automation port. The design:
//
//   - Off unless FOLIO_BENCH=1 *and* FOLIO_BENCH_DIR names an existing directory. Neither is ever
//     written to settings, and no UI or document can set an environment variable.
//   - No listener of any kind: no socket, no pipe, no HTTP. Go polls one file, <dir>/cmd.txt, four
//     times a second. The driver writes lines, Go renames the file to cmd.taken and reads it.
//   - Two commands, "open <docs-relative path>" and "panel <docs-relative path>". Go emits a
//     `bench:open` / `bench:panel` event with the path; the frontend opens it only if the path is a
//     file in the current index, through the same code a click uses. Nothing is read, written or
//     executed because of a command, and a path with ".." or a drive letter is dropped here.
//   - The frontend logs "bench: opened <path>" through the existing LogTimings binding, which is the
//     driver's acknowledgement (stderr is redirected to a file).
//
// With FOLIO_BENCH unset the only cost is one os.Getenv at start-up and an event handler in the
// frontend that nothing ever calls.

// EnvBench and EnvBenchDir switch the hook on.
const (
	EnvBench    = "FOLIO_BENCH"
	EnvBenchDir = "FOLIO_BENCH_DIR"
)

// BenchCommand is one line of cmd.txt.
type BenchCommand struct {
	Event string // "bench:open" or "bench:panel"
	Path  string // slash-separated, relative to the docs folder
}

// StartBench starts the poller when the environment asks for it. emit sends an event to the frontend.
func StartBench(emit func(event, path string)) {
	if os.Getenv(EnvBench) != "1" {
		return
	}
	dir := os.Getenv(EnvBenchDir)
	if fi, err := os.Stat(dir); dir == "" || err != nil || !fi.IsDir() {
		log.Printf("bench: %s=1 but %s is not an existing directory; hook off", EnvBench, EnvBenchDir)
		return
	}
	log.Printf("bench: hook on, polling %s", filepath.Join(dir, "cmd.txt"))
	go func() {
		for range time.Tick(250 * time.Millisecond) {
			for _, c := range TakeBenchCommands(dir) {
				emit(c.Event, c.Path)
			}
		}
	}()
}

// TakeBenchCommands claims <dir>/cmd.txt (renaming it so a later write starts a new file) and parses it.
// Unknown verbs and unsafe paths are dropped.
func TakeBenchCommands(dir string) []BenchCommand {
	src := filepath.Join(dir, "cmd.txt")
	taken := filepath.Join(dir, "cmd.taken")
	_ = os.Remove(taken)
	if err := os.Rename(src, taken); err != nil {
		return nil
	}
	f, err := os.Open(taken)
	if err != nil {
		return nil
	}
	defer f.Close()
	var out []BenchCommand
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		verb, arg, ok := strings.Cut(strings.TrimSpace(sc.Text()), " ")
		arg = strings.TrimSpace(arg)
		if !ok || !safeBenchPath(arg) {
			continue
		}
		switch verb {
		case "open":
			out = append(out, BenchCommand{"bench:open", arg})
		case "panel":
			out = append(out, BenchCommand{"bench:panel", arg})
		}
	}
	if err := sc.Err(); err != nil {
		log.Printf("bench: reading %s: %v", taken, err)
	}
	return out
}

func safeBenchPath(p string) bool {
	if p == "" || strings.ContainsAny(p, "\\:") || strings.HasPrefix(p, "/") {
		return false
	}
	for _, seg := range strings.Split(p, "/") {
		if seg == ".." {
			return false
		}
	}
	return true
}
