// Package mem measures Folio's own memory: the private bytes of this process plus every
// process below it (the msedgewebview2.exe tree). It is the same number scripts/ram-check.ps1
// reports (ticket 15), so the readout and the budget agree. Go measures; the frontend only
// shows the number.
package mem

// Proc is one row of a process snapshot.
type Proc struct {
	PID, Parent uint32
}

// Tree returns root and every process below it, found by parent PID. The snapshot is
// treated as untrusted: a reused PID can make the parent links cycle, so each PID is
// visited once.
func Tree(procs []Proc, root uint32) []uint32 {
	kids := make(map[uint32][]uint32, len(procs))
	for _, p := range procs {
		if p.PID != p.Parent {
			kids[p.Parent] = append(kids[p.Parent], p.PID)
		}
	}
	seen := map[uint32]bool{root: true}
	out := []uint32{root}
	for i := 0; i < len(out); i++ {
		for _, k := range kids[out[i]] {
			if !seen[k] {
				seen[k] = true
				out = append(out, k)
			}
		}
	}
	return out
}
