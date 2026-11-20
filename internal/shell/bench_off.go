//go:build !bench

package shell

// The shipped exe has no bench hook (ticket 18, L3). scripts/ram-check.ps1 needs one, so it runs a
// separate build made with -tags bench (task build:bench); see bench.go.

// BenchBuilt is false: this build has no bench hook.
const BenchBuilt = false

// BenchMemLog is always false here.
func BenchMemLog() bool { return false }

// StartBench does nothing in a build without the bench tag.
func StartBench(emit func(event, path string)) {}
