//go:build !production

package main

import (
	"os"

	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/shell"
)

// appOrigin is the page origin the runtime guard and the navigation watchdog trust. In `wails3 dev`
// the page comes from the Vite server, and Wails serves it as http://wails.localhost:<vite port>.
// Only this non-production build reads FRONTEND_DEVSERVER_URL (ticket 16).
func appOrigin() string {
	if o := shell.DevOrigin(os.Getenv("FRONTEND_DEVSERVER_URL")); o != "" {
		return o
	}
	return shell.AppOrigin
}
