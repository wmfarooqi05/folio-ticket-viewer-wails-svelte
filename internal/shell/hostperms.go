package shell

import (
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// Host hardening that is plain window configuration (ticket 16, H3 and H1).

// DeniedPermissions denies every cross-platform capability request. Wails sets a blanket
// "allow" when no permission policy exists, which would hand a page the microphone, camera,
// location, notifications and a silent clipboard read. The copy button writes to the
// clipboard (navigator.clipboard.writeText), which WebView2 allows without a permission prompt.
func DeniedPermissions() map[application.PermissionType]application.Permission {
	m := map[application.PermissionType]application.Permission{}
	for _, t := range []application.PermissionType{
		application.PermissionMicrophone, application.PermissionCamera, application.PermissionGeolocation,
		application.PermissionNotifications, application.PermissionClipboardRead,
	} {
		m[t] = application.PermissionDeny
	}
	return m
}

// lastWebView2PermissionKind is COREWEBVIEW2_PERMISSION_KIND_WINDOW_MANAGEMENT (12). Wails names
// only kinds 0 to 6, and any kind left out of its map falls back to WebView2's own prompt, so
// every numeric kind is listed here. Kinds the runtime does not know yet are harmless.
const lastWebView2PermissionKind = 12

// DeniedWebView2Permissions denies WebView2 permission kinds 1 to 12 (microphone, camera,
// geolocation, notifications, other sensors, clipboard read, automatic downloads, file
// read/write, autoplay, local fonts, MIDI sysex, window management).
func DeniedWebView2Permissions() map[application.CoreWebView2PermissionKind]application.CoreWebView2PermissionState {
	m := map[application.CoreWebView2PermissionKind]application.CoreWebView2PermissionState{}
	for k := 1; k <= lastWebView2PermissionKind; k++ {
		m[application.CoreWebView2PermissionKind(k)] = application.CoreWebView2PermissionStateDeny
	}
	return m
}

// returnHomeJS sends a page that is not Folio back to Folio. It runs inside whatever page loaded.
const returnHomeJS = `if (location.origin !== '` + AppOrigin + `') { location.replace('` + AppOrigin + `/'); }`

// WatchNavigation reloads Folio's home page whenever a navigation completes on another origin.
// Wails v3.1.0 gives no hook that can cancel a navigation, a new window or a download, so this
// watchdog is the backstop behind the page-side link guard (lib/render/dom.ts). It does nothing
// in `wails3 dev`, where the page comes from the Vite server (enabled is false then).
// An upstream issue asks for cancellable NavigationStarting (see ticket 16, Outcome).
func WatchNavigation(win *application.WebviewWindow, enabled bool) {
	if !enabled {
		return
	}
	win.RegisterHook(events.Windows.WebViewNavigationCompleted, func(*application.WindowEvent) {
		win.ExecJS(returnHomeJS)
	})
}
