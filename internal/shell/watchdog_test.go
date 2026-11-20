package shell

import (
	"sync/atomic"
	"testing"
	"time"
)

func testWatchdog(ping func()) (*Watchdog, *atomic.Int32) {
	var resets atomic.Int32
	d := NewWatchdog(AppOrigin, ping, func() { resets.Add(1) })
	d.grace, d.step = 80*time.Millisecond, 10*time.Millisecond
	return d, &resets
}

func TestWatchdogResetsAPageThatNeverAnswers(t *testing.T) {
	d, resets := testWatchdog(func() {})
	d.Arm()
	time.Sleep(300 * time.Millisecond)
	if resets.Load() != 1 {
		t.Fatalf("resets = %d, want 1", resets.Load())
	}
}

func TestWatchdogLeavesAPageThatAnswers(t *testing.T) {
	var d *Watchdog
	d, resets := testWatchdog(func() { go d.Ready(AppOrigin + "/") })
	d.Arm()
	time.Sleep(300 * time.Millisecond)
	if resets.Load() != 0 {
		t.Fatalf("resets = %d, want 0", resets.Load())
	}
}

func TestWatchdogIgnoresAnAnswerFromTheWrongPlace(t *testing.T) {
	// an about:blank page that inherited Folio's origin reports its own href, which is not Folio's
	var d *Watchdog
	d, resets := testWatchdog(func() {
		go d.Ready("about:blank")
		go d.Ready("https://evil.example/")
		go d.Ready(AppOrigin + ".evil.example/")
	})
	d.Arm()
	time.Sleep(300 * time.Millisecond)
	if resets.Load() != 1 {
		t.Fatalf("resets = %d, want 1", resets.Load())
	}
}

func TestWatchdogWaitsForALatePage(t *testing.T) {
	// the frontend defines its ping handler after the first ping: later pings still reach it
	var pings atomic.Int32
	var d *Watchdog
	d, resets := testWatchdog(func() {
		if pings.Add(1) >= 3 {
			go d.Ready(AppOrigin + "/")
		}
	})
	d.Arm()
	time.Sleep(300 * time.Millisecond)
	if resets.Load() != 0 {
		t.Fatalf("resets = %d, want 0", resets.Load())
	}
}

func TestWatchdogGivesUpOnABrokenFolio(t *testing.T) {
	d, resets := testWatchdog(func() {})
	for i := 0; i < 10; i++ {
		d.Arm()
		time.Sleep(150 * time.Millisecond)
	}
	if resets.Load() != watchMaxResets {
		t.Fatalf("resets = %d, want %d", resets.Load(), watchMaxResets)
	}
}
