package shell

import (
	"fmt"
	"log"
	"net"
	"net/url"
	"strconv"
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
// 'folio:where:<n>')` in the current page, and Wails hands the message to Options.RawMessageHandler
// with OriginInfo.TopOrigin, which is WebView2's own ICoreWebView2.get_Source (webview_window_windows.go,
// processMessage, `sender.GetSource()`). The page cannot choose or fake that value.
//
// The number n orders replies. TopOrigin is read when WebView2 delivers the message, but the message
// then waits in Wails' windowMessageBuffer and Where runs later on another goroutine, with no ordering
// against the NavigationCompleted hook. A reply to an older ping, read before a foreign page
// committed, could otherwise be processed after the new check started and mark the foreign page as
// answered. Every check only accepts replies to pings it sent itself. The origin still comes from the
// browser; n only says which check the reply belongs to.
//
//   - TopOrigin is not Folio's origin: reset at once.
//   - No reply at all (the page deleted chrome.webview, or Folio's page is too busy to run the ping):
//     reset after 5 s of silence once Folio has answered before, and before the first answer after
//     15 s counted from the first NavigationCompleted (a slow first load on a fresh profile has that
//     long). The periodic ping starts at the first NavigationCompleted, not at the first answer, so
//     a page that hijacks the very first load cannot silence it for good.
//   - A first navigation that never completes fires no NavigationCompleted at all: a backstop
//     from window creation resets every 30 s until Folio has answered once.
//   - Resets in a row that never get an answer (a "Leave site?" dialog the user keeps answering with
//     Stay, say) back off to one per 30 s instead of stopping for good.
const (
	watchSilence      = 5 * time.Second
	watchFirstSilence = 15 * time.Second
	watchBackstop     = 30 * time.Second
	watchStep         = 250 * time.Millisecond
	watchFirstStep    = time.Second // ping rate before the first answer: a slow first load queues them
	watchTick         = 10 * time.Second
	watchMinGap       = 400 * time.Millisecond // between resets while the page is still answering "foreign"
	watchBackoff      = 30 * time.Second       // between resets once watchMaxQuick in a row have failed
	watchMaxQuick     = 5
)

// WhereMessage is the prefix of the raw message the ping sends; the ping number follows it.
const WhereMessage = "folio:where:"

// PingJS is the script Go runs to make the browser report the window's top-level URL, numbered n.
func PingJS(n int) string {
	return fmt.Sprintf(`try { window.chrome.webview.postMessage('%s%d'); } catch (e) {}`, WhereMessage, n)
}

// RawHandler returns the application's RawMessageHandler: it routes ping replies to the watchdog,
// which is looked up through get because the window (and so the watchdog) is built after the app.
func RawHandler(get func() *Watchdog) func(application.Window, string, *application.OriginInfo) {
	return func(_ application.Window, msg string, o *application.OriginInfo) {
		if o == nil || !strings.HasPrefix(msg, WhereMessage) {
			return
		}
		n, err := strconv.Atoi(strings.TrimPrefix(msg, WhereMessage))
		if err != nil {
			return
		}
		if d := get(); d != nil {
			d.Where(o.TopOrigin, n)
		}
	}
}

// Watchdog sends a window back to Folio when its top-level page is not Folio's.
type Watchdog struct {
	origin string
	ping   func(js string)
	reset  func()

	silence, firstSilence, backstop, step, firstStep, minGap, backoff, tick time.Duration

	mu        sync.Mutex
	gen       int
	seq       int       // last ping number sent
	checkFrom int       // first ping number of the current check; older replies are ignored
	answered  bool      // Folio answered the current check
	started   bool      // Folio has answered at least once
	clock     time.Time // first NavigationCompleted (or the last reset): the first-answer limit counts from here
	created   time.Time
	resets    int // resets in a row with no Folio answer in between
	lastReset time.Time
	tickOnce  sync.Once
}

// NewWatchdog builds a watchdog for origin. ping runs a script in the current page; reset navigates
// the window to Folio's home page.
func NewWatchdog(origin string, ping func(js string), reset func()) *Watchdog {
	return &Watchdog{origin: origin, ping: ping, reset: reset, created: time.Now(),
		silence: watchSilence, firstSilence: watchFirstSilence, backstop: watchBackstop,
		step: watchStep, firstStep: watchFirstStep, tick: watchTick, minGap: watchMinGap, backoff: watchBackoff}
}

func (d *Watchdog) isApp(top string) bool {
	return top == d.origin || strings.HasPrefix(top, d.origin+"/")
}

// Where handles one reply (to ping number n) reporting the window's top-level URL.
func (d *Watchdog) Where(top string, n int) {
	d.mu.Lock()
	if n < d.checkFrom {
		d.mu.Unlock() // a reply to an older ping: it says nothing about the window now
		return
	}
	if d.isApp(top) {
		first := !d.started
		d.answered, d.started, d.resets = true, true, 0
		d.mu.Unlock()
		if first {
			log.Printf("shell: watchdog: Folio answered %v after the window was created", time.Since(d.created).Round(time.Millisecond))
		}
		return
	}
	d.mu.Unlock()
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
	d.clock = d.lastReset // the new load gets a fresh first-answer period
	d.mu.Unlock()
	log.Printf("shell: watchdog: %s; returning to %s/", why, d.origin)
	d.reset()
}

// Arm starts one check: ping until the browser reports where the window is, and reset the window if
// it stays silent too long. The first call also starts the periodic ping.
func (d *Watchdog) Arm() {
	d.mu.Lock()
	d.gen++
	g := d.gen
	d.answered = false
	d.checkFrom = d.seq + 1
	if d.clock.IsZero() {
		d.clock = time.Now()
	}
	d.mu.Unlock()
	d.tickOnce.Do(func() {
		go func() {
			for range time.Tick(d.tick) {
				d.Arm()
			}
		}()
	})
	go func() {
		start := time.Now()
		for {
			d.mu.Lock()
			if d.gen != g {
				d.mu.Unlock()
				return
			}
			d.seq++
			n, step := d.seq, d.step
			if !d.started {
				step = d.firstStep
			}
			d.mu.Unlock()
			d.ping(PingJS(n))
			time.Sleep(step)
			d.mu.Lock()
			superseded, answered, started, clock := d.gen != g, d.answered, d.started, d.clock
			d.mu.Unlock()
			if superseded || answered {
				return
			}
			if started && time.Since(start) >= d.silence {
				d.resetNow("no report from the page")
				return
			}
			if !started && time.Since(clock) >= d.firstSilence {
				d.resetNow("Folio did not answer after its first load")
				return
			}
		}
	}()
}

// WatchNavigation runs the watchdog on win: a check after every completed navigation (the first one
// also starts the periodic ping), and the creation backstop for a first navigation that never completes.
// Wails' own page-side link guard (lib/render/dom.ts) is the first line; this is the backstop.
// An upstream issue asks for cancellable NavigationStarting.
func WatchNavigation(win *application.WebviewWindow, d *Watchdog) {
	win.RegisterHook(events.Windows.WebViewNavigationCompleted, func(*application.WindowEvent) { d.Arm() })
	d.mu.Lock()
	d.created = time.Now()
	d.mu.Unlock()
	go func() {
		for {
			time.Sleep(d.backstop)
			d.mu.Lock()
			started := d.started
			d.mu.Unlock()
			if started {
				return
			}
			d.resetNow("Folio never answered since the window was created")
		}
	}()
}
