package shell

import (
	"fmt"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const fresh = 1 << 30 // a reply number newer than any ping

func testWatchdog(ping func(string)) (*Watchdog, *atomic.Int32) {
	var resets atomic.Int32
	d := NewWatchdog(AppOrigin, ping, func() { resets.Add(1) })
	d.silence, d.firstSilence, d.step, d.firstStep = 300*time.Millisecond, 600*time.Millisecond, 10*time.Millisecond, 20*time.Millisecond
	d.minGap, d.backoff, d.tick = 5*time.Millisecond, 400*time.Millisecond, time.Hour
	return d, &resets
}

func TestWatchdogResetsAtOnceWhenTheTopPageIsForeign(t *testing.T) {
	d, resets := testWatchdog(func(string) {})
	for _, top := range []string{"", "https://evil.example/", "about:blank", AppOrigin + ".evil.example/", "http://wails.localhost:9/"} {
		before := resets.Load()
		d.Where(top, fresh)
		if resets.Load() != before+1 {
			t.Errorf("top %q: no reset", top)
		}
		time.Sleep(10 * time.Millisecond) // past minGap
	}
}

func TestWatchdogLeavesFolio(t *testing.T) {
	d, resets := testWatchdog(func(string) {})
	d.Where(AppOrigin+"/", fresh)
	d.Where(AppOrigin, fresh)
	if resets.Load() != 0 {
		t.Fatalf("resets = %d", resets.Load())
	}
}

func TestWatchdogDoesNotResetABusyFolio(t *testing.T) {
	// Folio is busy for 2 s (a big diagram, a cold index): the ping gets no answer, then it does.
	var resets atomic.Int32
	d := NewWatchdog(AppOrigin, func(string) {}, func() { resets.Add(1) }) // the real 5 s silence period
	d.step, d.tick = 50*time.Millisecond, time.Hour
	d.Where(AppOrigin+"/", fresh) // Folio has answered before, so silence counts
	d.Arm()
	time.Sleep(2 * time.Second)
	d.Where(AppOrigin+"/", fresh)
	time.Sleep(300 * time.Millisecond)
	if resets.Load() != 0 {
		t.Fatalf("a busy Folio was reset %d times", resets.Load())
	}
}

func TestWatchdogGivesAFirstLoadItsFullPeriod(t *testing.T) {
	// a slow first load on a fresh profile: no answer yet, but the first-answer period has not run out
	d, resets := testWatchdog(func(string) {})
	d.Arm()
	time.Sleep(450 * time.Millisecond) // beyond the 300 ms silence period, inside the 600 ms first period
	if resets.Load() != 0 {
		t.Fatalf("resets = %d, want 0", resets.Load())
	}
}

func TestWatchdogResetsAHijackedFirstLoad(t *testing.T) {
	// the first page never answers and never reports (chrome.webview silenced): the very first check
	// still resets it once the first-answer period is over
	d, resets := testWatchdog(func(string) {})
	d.Arm()
	time.Sleep(900 * time.Millisecond)
	if resets.Load() < 1 {
		t.Fatal("a hijacked first load was never reset")
	}
}

func TestWatchdogFirstLoadClockSurvivesTheTick(t *testing.T) {
	// the periodic check replaces the running one; the first-answer period must still run out
	d, resets := testWatchdog(func(string) {})
	d.Arm()
	for i := 0; i < 8; i++ {
		time.Sleep(100 * time.Millisecond)
		d.Arm() // as the tick would
	}
	if resets.Load() < 1 {
		t.Fatal("re-arming must not restart the first-answer period")
	}
}

func TestWatchdogPeriodicPingStartsAtTheFirstCheck(t *testing.T) {
	var pings atomic.Int32
	d, _ := testWatchdog(func(string) { pings.Add(1) })
	d.tick = 150 * time.Millisecond
	d.Arm() // before any answer from Folio
	time.Sleep(500 * time.Millisecond)
	if pings.Load() < 4 {
		t.Fatalf("pings = %d: the periodic check did not start before the first answer", pings.Load())
	}
}

func TestWatchdogResetsAfterALongSilence(t *testing.T) {
	// the page deleted chrome.webview, so it never reports
	d, resets := testWatchdog(func(string) {})
	d.Where(AppOrigin+"/", fresh)
	d.Arm()
	time.Sleep(700 * time.Millisecond)
	if resets.Load() != 1 {
		t.Fatalf("resets = %d, want 1", resets.Load())
	}
}

func TestWatchdogStopsPingingOnceTheBrowserAnswers(t *testing.T) {
	var d *Watchdog
	var pings atomic.Int32
	d, _ = testWatchdog(func(js string) {
		if n := pings.Add(1); n == 3 {
			var seq int
			fmt.Sscanf(js[strings.Index(js, WhereMessage)+len(WhereMessage):], "%d", &seq)
			go d.Where(AppOrigin+"/", seq)
		}
	})
	d.started = true
	d.Arm()
	time.Sleep(400 * time.Millisecond)
	if n := pings.Load(); n < 3 || n > 5 {
		t.Fatalf("pings = %d, want about 3", n)
	}
}

func TestWatchdogIgnoresRepliesToOlderPings(t *testing.T) {
	// A reply read before a foreign page committed can be processed after the new check began. It must
	// neither mark the new page as answered nor trigger anything.
	var pings atomic.Int32
	d, resets := testWatchdog(func(string) { pings.Add(1) })
	d.started = true
	d.Arm()
	time.Sleep(30 * time.Millisecond)
	oldest := d.seq // the last ping of the first check
	d.Arm()         // a navigation completed: a new check
	time.Sleep(30 * time.Millisecond)
	before := pings.Load()
	d.Where(AppOrigin+"/", oldest) // late reply "Folio is here" to an older ping
	d.Where("https://evil.example/", oldest)
	time.Sleep(60 * time.Millisecond)
	if resets.Load() != 0 {
		t.Fatalf("a stale reply caused %d resets", resets.Load())
	}
	if pings.Load() <= before {
		t.Fatal("a stale 'Folio' reply stopped the new check from pinging: it counted as an answer")
	}
	// a reply to a ping of the new check counts
	d.Where(AppOrigin+"/", d.seq)
	b := pings.Load()
	time.Sleep(100 * time.Millisecond)
	if pings.Load() > b+1 {
		t.Fatalf("pings kept coming after a fresh answer: %d -> %d", b, pings.Load())
	}
}

func TestWatchdogBacksOffInsteadOfGivingUp(t *testing.T) {
	// a page that makes every reset fail ("Leave site?" answered Stay): quick resets, then one per backoff
	d, resets := testWatchdog(func(string) {})
	d.backoff = 1500 * time.Millisecond
	for i := 0; i < 40; i++ {
		d.Where("https://evil.example/", fresh)
		time.Sleep(10 * time.Millisecond)
	}
	if got := resets.Load(); got != watchMaxQuick {
		t.Fatalf("resets in 400 ms = %d, want %d (quick, then held back)", got, watchMaxQuick)
	}
	time.Sleep(1600 * time.Millisecond) // past the backoff gap: it tries again, it did not stop for good
	d.Where("https://evil.example/", fresh)
	if got := resets.Load(); got != watchMaxQuick+1 {
		t.Fatalf("resets after the backoff = %d, want %d", got, watchMaxQuick+1)
	}
}

func TestWatchdogAnswerClearsTheBackoff(t *testing.T) {
	d, resets := testWatchdog(func(string) {})
	for i := 0; i < watchMaxQuick; i++ {
		d.Where("https://evil.example/", fresh)
		time.Sleep(10 * time.Millisecond)
	}
	d.Where(AppOrigin+"/", fresh) // Folio is back
	time.Sleep(10 * time.Millisecond)
	d.Where("https://evil.example/", fresh)
	if got := resets.Load(); got != watchMaxQuick+1 {
		t.Fatalf("resets = %d, want %d (a fresh page gets a quick reset)", got, watchMaxQuick+1)
	}
}

func TestPingJSCarriesTheNumber(t *testing.T) {
	if got := PingJS(7); !strings.Contains(got, "'folio:where:7'") {
		t.Fatalf("PingJS(7) = %s", got)
	}
}

func TestRawHandlerReadsTheBrowsersTopOrigin(t *testing.T) {
	d, resets := testWatchdog(func(string) {})
	h := RawHandler(func() *Watchdog { return d })
	h(nil, "something else", &application.OriginInfo{TopOrigin: "https://evil.example/"})
	h(nil, WhereMessage+"1", nil)
	h(nil, WhereMessage+"x", &application.OriginInfo{TopOrigin: "https://evil.example/"}) // not a number
	h(nil, "folio:where", &application.OriginInfo{TopOrigin: "https://evil.example/"})    // the old form
	if resets.Load() != 0 {
		t.Fatal("other messages, a missing origin and a bad number must be ignored")
	}
	h(nil, WhereMessage+"1", &application.OriginInfo{Origin: AppOrigin + "/", TopOrigin: "https://evil.example/"})
	if resets.Load() != 1 {
		t.Fatalf("resets = %d, want 1: the top-level origin decides, not the sender's", resets.Load())
	}
	RawHandler(func() *Watchdog { return nil })(nil, WhereMessage+"1", &application.OriginInfo{TopOrigin: "x"}) // no watchdog yet: no panic
}
