package settings

import (
	"io/fs"
	"os"
	"runtime"
	"strings"
	"testing"
)

// fakeDisk is a disk of folders and links. Lstat refuses to be asked about a path that lies behind
// a link: a real Lstat would follow that link, which is the SMB contact this code exists to prevent.
type fakeDisk struct {
	t     *testing.T
	dirs  map[string]bool
	links map[string]string
}

type fakeInfo struct {
	os.FileInfo
	mode os.FileMode
}

func (f fakeInfo) Mode() os.FileMode { return f.mode }

func (d fakeDisk) fs() LinkFS {
	return LinkFS{
		Lstat: func(p string) (os.FileInfo, error) {
			for l := range d.links {
				if strings.HasPrefix(strings.ToLower(p), strings.ToLower(l)+`\`) {
					d.t.Errorf("Lstat(%s) goes through the link %s", p, l)
				}
			}
			if _, ok := d.links[p]; ok {
				return fakeInfo{mode: os.ModeSymlink}, nil
			}
			if d.dirs[p] {
				return fakeInfo{mode: os.ModeDir}, nil
			}
			return nil, fs.ErrNotExist
		},
		Readlink: func(p string) (string, error) { return d.links[p], nil },
	}
}

func TestPathReachesNetwork(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows paths")
	}
	d := fakeDisk{t: t,
		dirs: map[string]bool{`C:\r`: true, `C:\r\docs`: true, `C:\r\docs\modules`: true, `C:\r\docs\modules\a`: true, `C:\other`: true, `C:\r\ok`: true},
		links: map[string]string{
			// a link whose target passes through another link: ..\..\..\evil\y.md, evil -> \\host\share
			`C:\r\docs\modules\a\x.md`: `..\..\..\evil\y.md`,
			`C:\r\evil`:                `\\host\share`,
			// a link at the docs folder
			`C:\bad`: `\\host\share\docs`,
			// a rooted target, taken on the link's own drive: \x\b.md with C:\x a link to a share
			`C:\r\rooted.md`: `\x\b.md`,
			`C:\x`:           `\\evil\s`,
			// harmless links
			`C:\r\ok\l.md`:   `C:\other\a.md`,
			`C:\r\ok\rel.md`: `..\..\other\a.md`,
			`C:\r\ok\dev.md`: `\\?\C:\other\a.md`,
			// loops
			`C:\r\loop.md`: `loop.md`,
		},
	}
	f := d.fs()
	for path, want := range map[string]bool{
		`C:\r\docs\modules\a\x.md`:  true,  // the link whose target passes through a link
		`C:\bad\modules`:            true,  // the docs folder is a link to a share
		`C:\bad`:                    true,  // the docs folder itself
		`C:\r\rooted.md`:            true,  // \x\b.md goes through C:\x, not through C:\r\x
		`C:\r\ok\l.md`:              false, // a link to a local file
		`C:\r\ok\rel.md`:            false,
		`C:\r\ok\dev.md`:            false, // a local drive written as a device path
		`C:\r\loop.md`:              true,  // more than 16 hops
		`C:\r\docs\modules\a\y.md`:  false, // does not exist
		`C:\r\docs\modules`:         false,
		`C:\r\docs\..\ok`:           false,
		String(`\\host\share\repo`): false, // a network root is RootShapeError's business
	} {
		if got := f.PathReachesNetwork(path); got != want {
			t.Errorf("PathReachesNetwork(%s) = %v, want %v", path, got, want)
		}
	}
}

// String exists so the map above reads as a list of paths.
func String(s string) string { return s }

func TestJunctionThatCannotBeReadIsRefused(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows paths")
	}
	f := LinkFS{
		Lstat: func(p string) (os.FileInfo, error) {
			if p == `C:\j` {
				return fakeInfo{mode: os.ModeIrregular}, nil
			}
			return nil, fs.ErrNotExist
		},
		Readlink: func(string) (string, error) { return "", fs.ErrInvalid },
	}
	if !f.PathReachesNetwork(`C:\j\x`) {
		t.Fatal("a junction whose target cannot be read must be refused")
	}
}
