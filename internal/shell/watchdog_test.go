package shell

import (
	"sync/atomic"
	"testing"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func testWatchdog(ping func()) (*Watchdog, *atomic.Int32) {
	var resets atomic.Int32
	d := NewWatchdog(AppOrigin, ping, func() { resets.Add(1) })
	d.silence, d.step = 300*time.Millisecond, 10*time.Millisecond
	d.minGap, d.backoff = 5*time.Millisecond, 400*time.Millisecond
	return d, &resets
}

func TestWatchdogResetsAtOnceWhenTheTopPageIsForeign(t *testing.T) {
	d, resets := testWatchdog(func() {})
	for _, top := range []string{"", "https://evil.example/", "about:blank", AppOrigin + ".evil.example/"} {
		before := resets.Load()
		d.Where(top)
		if resets.Load() != before+1 {
			t.Errorf("top %q: no reset", top)
		}
		time.Sleep(10 * time.Millisecond) // past minGap
	}
}

func TestWatchdogLeavesFolio(t *testing.T) {
	d, resets := testWatchdog(func() {})
	d.Where(AppOrigin + "/")
	d.Where(AppOrigin)
	if resets.Load() != 0 {
		t.Fatalf("resets = %d", resets.Load())
	}
}

func TestWatchdogDoesNotResetABusyFolio(t *testing.T) {
	// Folio is busy for 2 s (a big diagram, a cold index): the ping gets no answer, then it does.
	var resets atomic.Int32
	d := NewWatchdog(AppOrigin, func() {}, func() { resets.Add(1) }) // the real 5 s silence period
	d.step = 50 * time.Millisecond
	d.Where(AppOrigin + "/") // Folio has answered before, so silence counts
	d.Arm()
	time.Sleep(2 * time.Second)
	d.Where(AppOrigin + "/")
	time.Sleep(300 * time.Millisecond)
	if resets.Load() != 0 {
		t.Fatalf("a busy Folio was reset %d times", resets.Load())
	}
}

func TestWatchdogNeverResetsOnSilenceBeforeTheFirstAnswer(t *testing.T) {
	// a slow first load on a fresh profile: the page cannot answer yet
	d, resets := testWatchdog(func() {})
	d.Arm()
	time.Sleep(900 * time.Millisecond) // three times the silence period
	if resets.Load() != 0 {
		t.Fatalf("resets = %d, want 0", resets.Load())
	}
}

func TestWatchdogResetsAfterALongSilence(t *testing.T) {
	// the page deleted chrome.webview, so it never reports
	d, resets := testWatchdog(func() {})
	d.Where(AppOrigin + "/")
	d.Arm()
	time.Sleep(700 * time.Millisecond)
	if resets.Load() != 1 {
		t.Fatalf("resets = %d, want 1", resets.Load())
	}
}

func TestWatchdogStopsPingingOnceTheBrowserAnswers(t *testing.T) {
	var d *Watchdog
	var pings atomic.Int32
	d, _ = testWatchdog(func() {
		if pings.Add(1) == 3 {
			go d.Where(AppOrigin + "/")
		}
	})
	d.Arm()
	time.Sleep(400 * time.Millisecond)
	if n := pings.Load(); n < 3 || n > 5 {
		t.Fatalf("pings = %d, want about 3", n)
	}
}

func TestWatchdogBacksOffInsteadOfGivingUp(t *testing.T) {
	// a page that makes every reset fail ("Leave site?" answered Stay): quick resets, then one per backoff
	d, resets := testWatchdog(func() {})
	d.backoff = 1500 * time.Millisecond
	for i := 0; i < 40; i++ {
		d.Where("https://evil.example/")
		time.Sleep(10 * time.Millisecond)
	}
	if got := resets.Load(); got != watchMaxQuick {
		t.Fatalf("resets in 400 ms = %d, want %d (quick, then held back)", got, watchMaxQuick)
	}
	time.Sleep(1600 * time.Millisecond) // past the backoff gap: it tries again, it did not stop for good
	d.Where("https://evil.example/")
	if got := resets.Load(); got != watchMaxQuick+1 {
		t.Fatalf("resets after the backoff = %d, want %d", got, watchMaxQuick+1)
	}
}

func TestWatchdogAnswerClearsTheBackoff(t *testing.T) {
	d, resets := testWatchdog(func() {})
	for i := 0; i < watchMaxQuick; i++ {
		d.Where("https://evil.example/")
		time.Sleep(10 * time.Millisecond)
	}
	d.Where(AppOrigin + "/") // Folio is back
	time.Sleep(10 * time.Millisecond)
	d.Where("https://evil.example/")
	if got := resets.Load(); got != watchMaxQuick+1 {
		t.Fatalf("resets = %d, want %d (a fresh page gets a quick reset)", got, watchMaxQuick+1)
	}
}

func TestRawHandlerReadsTheBrowsersTopOrigin(t *testing.T) {
	d, resets := testWatchdog(func() {})
	h := RawHandler(func() *Watchdog { return d })
	h(nil, "something else", &application.OriginInfo{TopOrigin: "https://evil.example/"})
	h(nil, WhereMessage, nil)
	if resets.Load() != 0 {
		t.Fatal("other messages and a missing origin must be ignored")
	}
	h(nil, WhereMessage, &application.OriginInfo{Origin: AppOrigin + "/", TopOrigin: "https://evil.example/"})
	if resets.Load() != 1 {
		t.Fatalf("resets = %d, want 1: the top-level origin decides, not the sender's", resets.Load())
	}
	RawHandler(func() *Watchdog { return nil })(nil, WhereMessage, &application.OriginInfo{TopOrigin: "x"}) // no watchdog yet: no panic
}
