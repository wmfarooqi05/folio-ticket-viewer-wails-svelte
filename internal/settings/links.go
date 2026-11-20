package settings

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
)

// LinkFS is the two file-system calls PathReachesNetwork makes, so tests can inject a fake disk.
// Neither may follow a link (Lstat, Readlink): following one is what starts SMB.
type LinkFS struct {
	Lstat    func(string) (os.FileInfo, error)
	Readlink func(string) (string, error)
}

// OSLinks is the real file system.
var OSLinks = LinkFS{Lstat: os.Lstat, Readlink: os.Readlink}

// maxLinkHops caps how many links one path may pass through before it is refused as a loop.
const maxLinkHops = 16

// PathReachesNetwork reports whether resolving p would, through a symlink or junction anywhere on
// the way, reach a network or device path (\\host\share). A hostile cloned repo can plant such a
// link, and merely statting through it makes Windows talk SMB with the user's credentials (L2).
//
// It resolves p one part at a time from the left: Lstat each part (which never follows the part
// itself, and so never goes through a link already passed, because the walk replaces a link by its
// target before going on), Readlink every link met, run the network check on that target before
// touching it, and continue from the target. More than 16 links is refused as a loop. A part that
// does not exist ends the walk with "no": nothing beyond it can be a link.
//
// A p that is itself a network path returns false: that case belongs to RootShapeError (it is the
// folder the user picked in the native dialog, or it is already refused).
func (f LinkFS) PathReachesNetwork(p string) bool {
	if p == "" || IsNetworkPath(p) {
		return false
	}
	sep := string(filepath.Separator)
	vol := filepath.VolumeName(p)
	cur := vol + sep
	pending := splitParts(p[len(vol):])
	hops := 0
	for len(pending) > 0 {
		part := pending[0]
		pending = pending[1:]
		switch part {
		case "", ".":
			continue
		case "..":
			cur = filepath.Dir(cur) // cur holds no links: it is already resolved
			continue
		}
		next := filepath.Join(cur, part)
		fi, err := f.Lstat(next)
		if err != nil {
			return false
		}
		if fi.Mode()&(os.ModeSymlink|os.ModeIrregular) == 0 {
			cur = next
			continue
		}
		if hops++; hops > maxLinkHops {
			return true
		}
		target, err := f.Readlink(next)
		if err != nil {
			return true // a link (or junction) that cannot be read cannot be shown to be local
		}
		if IsNetworkLinkTarget(target) {
			return true
		}
		switch tv := filepath.VolumeName(target); {
		case tv != "": // C:\x, or \\?\C:\x
			cur = tv + sep
			target = target[len(tv):]
		case strings.HasPrefix(target, `\`) || strings.HasPrefix(target, "/"):
			// \x\b.md: rooted on the drive of the folder the link is in, not relative to it
			cur = filepath.VolumeName(cur) + sep
		}
		pending = append(splitParts(target), pending...)
	}
	return false
}

// PathReachesNetwork is LinkFS.PathReachesNetwork on the real file system.
func PathReachesNetwork(p string) bool { return OSLinks.PathReachesNetwork(p) }

func splitParts(s string) []string {
	return strings.FieldsFunc(s, func(r rune) bool { return r == '\\' || r == '/' })
}

// ErrNetworkLink is returned by SafeStat for a path that would reach the network through a link.
var ErrNetworkLink = errors.New("a link on the path leads to a network or device path")

// SafeStat is os.Stat that never goes through a link to a network path. Use it for every stat of
// repoRoot, the docs folder or a docs root (and anything below them found by a walk).
func SafeStat(p string) (os.FileInfo, error) {
	if PathReachesNetwork(p) {
		return nil, ErrNetworkLink
	}
	return os.Stat(p)
}

// SafeIsDir reports whether p is an existing folder, without ever going through a network link.
func SafeIsDir(p string) bool {
	st, err := SafeStat(p)
	return err == nil && st.IsDir()
}
