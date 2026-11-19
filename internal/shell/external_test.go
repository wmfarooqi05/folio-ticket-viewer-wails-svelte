package shell

import "testing"

func TestValidateExternalURL(t *testing.T) {
	ok := []string{
		"https://dev.azure.com/acme/p/_workitems/edit/72633",
		"http://example.com/a?b=c#d",
		"  HTTPS://Example.com/x  ",
	}
	for _, in := range ok {
		if _, err := ValidateExternalURL(in); err != nil {
			t.Errorf("%q rejected: %v", in, err)
		}
	}
	bad := []string{
		"", "   ",
		"file:///C:/Windows/System32/calc.exe",
		"javascript:alert(1)",
		"vscode://file/C:/x",
		"data:text/html,<b>x</b>",
		"ftp://example.com/x",
		"mailto:a@b.c",
		"//example.com/x",
		"example.com/x",
		"C:\\Windows\\notepad.exe",
		"https://",
		"https:///path",
		"https://user:pw@example.com/",
		"https://example.com/\nfile:///x",
		"http//example.com",
		"https://example.com/?a=b c",
		"https://example.com/?a=\"x\"",
		"https://example.com/?a=<b>",
		"https://example.com/?a=b\\c",
		"https://example.com/?a=b^c",
		"https://example.com/?a=`x`",
		"https://example.com/?a={b}|c",
	}
	for _, in := range bad {
		if got, err := ValidateExternalURL(in); err == nil {
			t.Errorf("%q accepted as %q", in, got)
		}
	}
}
