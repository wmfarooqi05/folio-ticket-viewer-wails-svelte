package shell

import "testing"

func TestVSCodeURL(t *testing.T) {
	cases := []struct {
		abs  string
		line int
		want string
	}{
		{`E:\src\Lockbox and Cash Payment\docs\modules\x\issues\05-a.md`, 12,
			"vscode://file/E:/src/Lockbox%20and%20Cash%20Payment/docs/modules/x/issues/05-a.md:12"},
		{`E:\a\b.md`, 0, "vscode://file/E:/a/b.md"},
		{`E:\a\b.md`, -3, "vscode://file/E:/a/b.md"},
		{"/home/u/a b/c.md", 1, "vscode://file/home/u/a%20b/c.md:1"},
		{`E:\a\50% done #1.md`, 7, "vscode://file/E:/a/50%25%20done%20%231.md:7"},
	}
	for _, c := range cases {
		if got := VSCodeURL(c.abs, c.line); got != c.want {
			t.Errorf("VSCodeURL(%q, %d)\n got  %s\n want %s", c.abs, c.line, got, c.want)
		}
	}
}
