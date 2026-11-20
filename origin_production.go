//go:build production

package main

import "github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/shell"

// appOrigin is the page origin the runtime guard and the navigation watchdog trust. The production
// exe never reads FRONTEND_DEVSERVER_URL (ticket 16); see origin_dev.go for the dev build.
func appOrigin() string { return shell.AppOrigin }
