package docs

import (
	"slices"
	"testing"
	"time"
)

// Ticket 25: a "." root is the whole docs folder, with the usual scope skips.

func wholeService(t *testing.T, roots []string, emit func(ChangeSet)) (*DocsService, string) {
	t.Helper()
	root := t.TempDir()
	write(t, root, "map.md", "# Map\n")
	write(t, root, "issues/01-a.md", "# A\n")
	write(t, root, "modules/m/issues/01-b.md", "# B\n")
	write(t, root, "_templates/t.md", "skipped")
	write(t, root, ".git/x.md", "skipped")
	write(t, root, "node_modules/p/readme.md", "skipped")
	write(t, root, "notes/n.txt", "not markdown")
	s := NewService(func() Roots { return Roots{Docs: root, Roots: roots} }, emit)
	t.Cleanup(func() { _ = s.ServiceShutdown() })
	return s, root
}

func TestWholeRootScansEverythingInScope(t *testing.T) {
	s, _ := wholeService(t, []string{"."}, nil)
	res, err := s.Scan()
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"issues/01-a.md", "map.md", "modules/m/issues/01-b.md"}
	if !slices.Equal(res.Changed, want) || res.Count != 3 {
		t.Fatalf("unexpected scan: %+v", res)
	}
}

func TestWholeRootAndModulesListEachFileOnce(t *testing.T) {
	s, _ := wholeService(t, []string{".", "modules"}, nil)
	res, err := s.Scan()
	if err != nil {
		t.Fatal(err)
	}
	if res.Count != 3 || len(res.Changed) != 3 {
		t.Fatalf("a file was listed twice: %+v", res)
	}
}

func TestInScopeWithWholeRoot(t *testing.T) {
	for _, c := range []struct {
		rel          string
		whole, scope bool
	}{
		{"modules/a/x.md", false, true},
		{"_templates/x.md", true, false},
		{".git/x.md", true, false},
		{"node_modules/x.md", true, false},
		{"issues/01-a.md", true, true},
		{"modules/_t/x.md", false, false},
		{"_odd/x.md", false, true}, // parts[0] is a configured root when there is no "."
	} {
		if got := inScope(c.rel, c.whole); got != c.scope {
			t.Errorf("inScope(%q, %v) = %v, want %v", c.rel, c.whole, got, c.scope)
		}
	}
}

func TestWholeRootWatcherSeesNewFilesAndSkipsOthers(t *testing.T) {
	got := make(chan ChangeSet, 8)
	s, root := wholeService(t, []string{"."}, func(cs ChangeSet) { got <- cs })
	if _, err := s.Scan(); err != nil {
		t.Fatal(err)
	}
	write(t, root, "_templates/new.md", "skipped") // out of scope: must not be announced
	write(t, root, "issues/02-new.md", "# New\n")
	deadline := time.After(5 * time.Second)
	for {
		select {
		case cs := <-got:
			if slices.Contains(cs.Changed, "_templates/new.md") {
				t.Fatalf("a skipped folder was announced: %+v", cs)
			}
			if slices.Contains(cs.Changed, "issues/02-new.md") {
				return
			}
		case <-deadline:
			t.Fatal("no docs:changed event for the new ticket")
		}
	}
}
