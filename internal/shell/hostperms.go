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

// The navigation watchdog (ticket 16, H1).
//
// Wails v3.1.0 gives Go no way to cancel a navigation, and a reset run inside the foreign page
// (location.replace) can be cancelled by that page. So Go resets from outside, and it learns where
// the window really is from the browser, not from the page: Go runs `chrome.webview.postMessage(
// 'folio:where')` in the current page, and Wails hands the message to Options.RawMessageHandler with
// OriginInfo.TopOrigin, which is WebView2's own ICoreWebView2.get_Source (webview_window_windows.go,
// processMessage, `sender.GetSource()`). The page cannot choose or fake that value, and a message
// that arrives late still reports where the window is when Go reads it, so it cannot vouch for a
// page that came after it.
//
//   - TopOrigin is not Folio's origin: reset at once.
//   - No message at all (the page deleted chrome.webview, or Folio's own page is too busy to run the
//     ping): reset only after a long silence, about 5 s, and only once Folio has answered at least
//     once, so a slow first load on a fresh profile is never reset.
//   - The periodic ping does not start until the first answer.
//   - Resets in a row that never get an answer (a "Leave site?" dialog the user keeps answering with
//     Stay, say) back off to one per 30 s instead of stopping for good.
const (
	watchSilence  = 5 * time.Second
	watchStep     = 250 * time.Millisecond
	watchTick     = 10 * time.Second
	watchMinGap   = 400 * time.Millisecond // between resets while the page is still answering "foreign"
	watchBackoff  = 30 * time.Second       // between resets once watchMaxResets in a row have failed
	watchMaxQuick = 5
)

// PingJS asks the browser to report the window's top-level URL to RawMessageHandler.
const PingJS = `try { window.chrome.webview.postMessage('folio:where'); } catch (e) {}`

// WhereMessage is the raw message PingJS sends.
const WhereMessage = "folio:where"

// RawHandler returns the application's RawMessageHandler: it routes WhereMessage to the watchdog,
// which is looked up through get because the window (and so the watchdog) is built after the app.
func RawHandler(get func() *Watchdog) func(application.Window, string, *application.OriginInfo) {
	return func(_ application.Window, msg string, o *application.OriginInfo) {
		if msg != WhereMessage || o == nil {
			return
		}
		if d := get(); d != nil {
			d.Where(o.TopOrigin)
		}
	}
}

// Watchdog sends a window back to Folio when its top-level page is not Folio's.
type Watchdog struct {
	origin string
	ping   func()
	reset  func()

	silence, step, minGap, backoff time.Duration
	tick                           time.Duration
	onFirstAnswer                  func() // starts the periodic ping; set by WatchNavigation

	mu        sync.Mutex
	gen       int
	answered  bool // an answer for the current check
	started   bool // Folio has answered at least once
	resets    int  // resets in a row with no Folio answer in between
	lastReset time.Time
	once      sync.Once
}

// NewWatchdog builds a watchdog for origin. ping runs PingJS in the current page; reset navigates
// the window to Folio's home page.
func NewWatchdog(origin string, ping, reset func()) *Watchdog {
	return &Watchdog{origin: origin, ping: ping, reset: reset, silence: watchSilence, step: watchStep,
		tick: watchTick, minGap: watchMinGap, backoff: watchBackoff}
}

func (d *Watchdog) isApp(top string) bool {
	return top == d.origin || strings.HasPrefix(top, d.origin+"/")
}

// Where handles one report of the window's top-level URL.
func (d *Watchdog) Where(top string) {
	if d.isApp(top) {
		d.mu.Lock()
		d.answered, d.started, d.resets = true, true, 0
		d.mu.Unlock()
		d.once.Do(func() {
			if d.onFirstAnswer != nil {
				go d.onFirstAnswer()
			}
		})
		return
	}
	d.resetNow("top-level page is " + top)
}

// resetNow returns the window to Folio, throttled: quick at first, then once per backoff.
func (d *Watchdog) resetNow(why string) {
	d.mu.Lock()
	gap := d.minGap
	if d.resets >= watchMaxQuick {
		gap = d.backoff
	}
	if !d.lastReset.IsZero() && time.Since(d.lastReset) < gap {
		d.mu.Unlock()
		return
	}
	d.resets++
	d.lastReset = time.Now()
	d.mu.Unlock()
	log.Printf("shell: watchdog: %s; returning to %s/", why, d.origin)
	d.reset()
}

// Arm starts one check: ping until the browser reports where the window is, and reset it if it stays
// silent for the silence period (once Folio has answered before).
func (d *Watchdog) Arm() {
	d.mu.Lock()
	d.gen++
	g := d.gen
	d.answered = false
	d.mu.Unlock()
	go func() {
		start := time.Now()
		for {
			d.ping()
			time.Sleep(d.step)
			d.mu.Lock()
			superseded, answered, started := d.gen != g, d.answered, d.started
			d.mu.Unlock()
			if superseded || answered {
				return
			}
			if time.Since(start) >= d.silence {
				if started {
					d.resetNow("no report from the page")
				}
				return
			}
		}
	}()
}

// WatchNavigation runs the watchdog on win: a check after every completed navigation, and a slow
// periodic one that starts at the first answer (it catches a page whose load never finishes, which
// fires no NavigationCompleted). Wails' own page-side link guard (lib/render/dom.ts) is the first
// line; this is the backstop. An upstream issue asks for cancellable NavigationStarting.
func WatchNavigation(win *application.WebviewWindow, d *Watchdog) {
	d.onFirstAnswer = func() {
		for range time.Tick(d.tick) {
			d.Arm()
		}
	}
	win.RegisterHook(events.Windows.WebViewNavigationCompleted, func(*application.WindowEvent) { d.Arm() })
}
