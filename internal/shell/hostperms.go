package shell

import (
	"log"
	"net"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// Host hardening that is window configuration (ticket 16, H3, M1) and the navigation watchdog (H1).

// Harden applies the hardened window options: every permission denied, no default context menu.
// main.go passes the window options through it, and a test checks what comes out.
func Harden(o application.WebviewWindowOptions) application.WebviewWindowOptions {
	o.Permissions = DeniedPermissions()
	o.DefaultContextMenuDisabled = true // no Save as / Print / Inspect menu (ticket 16, M1)
	o.Windows.Permissions = DeniedWebView2Permissions()
	return o
}

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

// DeniedWebView2Permissions denies WebView2 permission kinds 0 to 12 (unknown, microphone, camera,
// geolocation, notifications, other sensors, clipboard read, automatic downloads, file
// read/write, autoplay, local fonts, MIDI sysex, window management).
func DeniedWebView2Permissions() map[application.CoreWebView2PermissionKind]application.CoreWebView2PermissionState {
	m := map[application.CoreWebView2PermissionKind]application.CoreWebView2PermissionState{}
	for k := 0; k <= lastWebView2PermissionKind; k++ {
		m[application.CoreWebView2PermissionKind(k)] = application.CoreWebView2PermissionStateDeny
	}
	return m
}

// DevOrigin is the page origin in `wails3 dev`: Wails keeps the wails.localhost host and swaps in the
// port of FRONTEND_DEVSERVER_URL (assetserver.GetStartURL). It returns "" when devURL has no port.
// Only the non-production build reads that variable (see devorigin_dev.go in package main).
func DevOrigin(devURL string) string {
	u, err := url.Parse(devURL)
	if err != nil || u.Port() == "" {
		return ""
	}
	return "http://" + net.JoinHostPort("wails.localhost", u.Port())
}

// The liveness handshake (ticket 16, H1).
//
// Wails v3.1.0 gives Go no way to cancel a navigation or even to read the current URL, and a
// reset run inside the foreign page (location.replace) can be cancelled by that page. So Go
// resets from outside. After every navigation Go pings the page (window.__folioPing, defined by
// Folio's frontend), and Folio's page answers by calling the bound ShellService.Ready(location.href).
// Only Folio's origin passes the runtime guard, so a foreign page cannot answer. No answer within
// the grace period and Go navigates the window back to "/" itself. A slow tick repeats the ping,
// which also catches a page whose load never finishes (no NavigationCompleted ever fires).
const (
	watchGrace = 600 * time.Millisecond
	watchStep  = 100 * time.Millisecond
	watchTick  = 2 * time.Second
	// after this many resets in a row with no answer Folio's own page is broken; stop reloading it
	watchMaxResets = 5
)

const pingJS = `if (window.__folioPing) window.__folioPing();`

// Watchdog sends a window back to Folio when the page does not prove it is Folio.
type Watchdog struct {
	origin string
	ping   func()
	reset  func()
	grace  time.Duration
	step   time.Duration

	mu     sync.Mutex
	gen    int
	ready  bool
	resets int
}

// NewWatchdog builds a watchdog. ping asks the page to call Ready; reset navigates the window to Folio.
func NewWatchdog(origin string, ping, reset func()) *Watchdog {
	return &Watchdog{origin: origin, ping: ping, reset: reset, grace: watchGrace, step: watchStep}
}

// Ready is the page's answer. href is the page's own location.href, so an about:blank page that
// inherited Folio's origin does not count.
func (d *Watchdog) Ready(href string) {
	if !strings.HasPrefix(href, d.origin+"/") {
		return
	}
	d.mu.Lock()
	d.ready = true
	d.resets = 0
	d.mu.Unlock()
}

// Arm starts one check: ping until the page answers, and reset it if it does not within the grace period.
func (d *Watchdog) Arm() {
	d.mu.Lock()
	d.gen++
	g := d.gen
	d.ready = false
	d.mu.Unlock()
	go func() {
		start := time.Now()
		for {
			d.ping()
			time.Sleep(d.step)
			d.mu.Lock()
			superseded, answered := d.gen != g, d.ready
			if !superseded && !answered && time.Since(start) >= d.grace {
				d.resets++
				give := d.resets > watchMaxResets
				d.mu.Unlock()
				if give {
					log.Printf("shell: watchdog: the page did not answer %d times; not reloading again", watchMaxResets)
				} else {
					log.Printf("shell: watchdog: page did not prove it is Folio; returning to %s/", d.origin)
					d.reset()
				}
				return
			}
			d.mu.Unlock()
			if superseded || answered {
				return
			}
		}
	}()
}

// WatchNavigation runs the watchdog on win: it arms after every completed navigation and on a slow
// tick. Wails' own page-side link guard (lib/render/dom.ts) is the first line; this is the backstop.
// An upstream issue asks for cancellable NavigationStarting (see ticket 16, Outcome).
func WatchNavigation(win *application.WebviewWindow, d *Watchdog) {
	win.RegisterHook(events.Windows.WebViewNavigationCompleted, func(*application.WindowEvent) { d.Arm() })
	go func() {
		for range time.Tick(watchTick) {
			d.Arm()
		}
	}()
}

// NewWindowWatchdog wires a Watchdog to a real window. The window's own SetURL resolves "/" against
// the app origin (the dev server's port in `wails3 dev`).
func NewWindowWatchdog(win *application.WebviewWindow, origin string) *Watchdog {
	return NewWatchdog(origin, func() { win.ExecJS(pingJS) }, func() { win.SetURL("/") })
}
