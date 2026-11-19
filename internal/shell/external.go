package shell

import (
	"errors"
	"net/url"
	"strings"
)

// ValidateExternalURL accepts only absolute http and https URLs with a host and
// returns the URL to open. Everything else (file:, javascript:, vscode:, data:,
// relative paths, control characters) is rejected.
func ValidateExternalURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", errors.New("empty link")
	}
	if strings.ContainsAny(raw, "\x00\r\n\t") {
		return "", errors.New("link contains control characters")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", errors.New("not a valid link")
	}
	if s := strings.ToLower(u.Scheme); s != "http" && s != "https" {
		return "", errors.New("only http and https links can be opened")
	}
	// Characters that must be escaped in a query. Rejecting them keeps a crafted
	// template from smuggling extra arguments into the shell handoff.
	if strings.ContainsAny(u.RawQuery, " \"<>\\^`{|}") {
		return "", errors.New("link query contains unsafe characters")
	}
	if u.Hostname() == "" || u.User != nil {
		return "", errors.New("link needs a host and no credentials")
	}
	return u.String(), nil
}
