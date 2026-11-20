package mem

import (
	"slices"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestTreeWalk(t *testing.T) {
	procs := []Proc{
		{PID: 1, Parent: 0},
		{PID: 10, Parent: 1}, // root
		{PID: 11, Parent: 10},
		{PID: 12, Parent: 10},
		{PID: 20, Parent: 11}, // grandchild
		{PID: 30, Parent: 2},  // unrelated
		{PID: 31, Parent: 30},
	}
	got := Tree(procs, 10)
	slices.Sort(got)
	if want := []uint32{10, 11, 12, 20}; !slices.Equal(got, want) {
		t.Fatalf("Tree = %v, want %v", got, want)
	}
}

func TestTreeSurvivesCyclesAndSelfParent(t *testing.T) {
	procs := []Proc{{PID: 5, Parent: 5}, {PID: 6, Parent: 7}, {PID: 7, Parent: 6}, {PID: 8, Parent: 5}, {PID: 5, Parent: 8}}
	got := Tree(procs, 5)
	slices.Sort(got)
	if want := []uint32{5, 8}; !slices.Equal(got, want) {
		t.Fatalf("Tree = %v, want %v", got, want)
	}
	if got := Tree(nil, 9); !slices.Equal(got, []uint32{9}) {
		t.Fatalf("empty snapshot: %v", got)
	}
}

// harness drives a Monitor with a fake sampler and a recorder.
type harness struct {
	m       *Monitor
	val     atomic.Uint64
	samples atomic.Int64
	mu      sync.Mutex
	emitted []uint64
}

func newHarness(interval time.Duration) *harness {
	h := &harness{}
	h.m = newMonitor(func() (uint64, error) {
		h.samples.Add(1)
		return h.val.Load(), nil
	}, func(v uint64) {
		h.mu.Lock()
		h.emitted = append(h.emitted, v)
		h.mu.Unlock()
	}, interval, Threshold)
	return h
}

func (h *harness) got() []uint64 {
	h.mu.Lock()
	defer h.mu.Unlock()
	return slices.Clone(h.emitted)
}

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	for i := 0; i < 400; i++ {
		if cond() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

const mb = 1 << 20

func TestFirstSampleEmitsThenOnlyOnThreshold(t *testing.T) {
	h := newHarness(5 * time.Millisecond)
	h.val.Store(100 * mb)
	h.m.SetEnabled(true)
	defer h.m.Close()
	waitFor(t, "first emit", func() bool { return len(h.got()) == 1 })

	// a move under 1 MB, either way, emits nothing
	h.val.Store(100*mb + mb - 1)
	n := h.samples.Load()
	waitFor(t, "more samples", func() bool { return h.samples.Load() > n+3 })
	h.val.Store(100*mb - (mb - 1))
	n = h.samples.Load()
	waitFor(t, "more samples", func() bool { return h.samples.Load() > n+3 })
	if g := h.got(); len(g) != 1 {
		t.Fatalf("sub-threshold change emitted: %v", g)
	}

	// exactly 1 MB from the LAST EMITTED value emits (up), and the reference moves
	h.val.Store(101 * mb)
	waitFor(t, "up emit", func() bool { return len(h.got()) == 2 })
	h.val.Store(100 * mb) // 1 MB down from 101
	waitFor(t, "down emit", func() bool { return len(h.got()) == 3 })
	if g := h.got(); g[1] != 101*mb || g[2] != 100*mb {
		t.Fatalf("emitted %v", g)
	}
}

func TestSlowDriftIsNotLost(t *testing.T) {
	// 0.4 MB steps: compared with the last emitted value, not the last sample
	h := newHarness(2 * time.Millisecond)
	h.val.Store(50 * mb)
	h.m.SetEnabled(true)
	defer h.m.Close()
	waitFor(t, "first", func() bool { return len(h.got()) == 1 })
	for i := 1; i <= 3; i++ {
		h.val.Store(50*mb + uint64(i)*(mb*4/10))
		n := h.samples.Load()
		waitFor(t, "sample", func() bool { return h.samples.Load() > n+2 })
	}
	waitFor(t, "drift emit", func() bool { return len(h.got()) == 2 })
}

func TestPauseResume(t *testing.T) {
	h := newHarness(3 * time.Millisecond)
	h.val.Store(10 * mb)
	h.m.SetEnabled(true)
	defer h.m.Close()
	waitFor(t, "running", func() bool { return h.samples.Load() > 3 })

	for _, tc := range []struct {
		name         string
		pause, unset func()
	}{
		{"minimise", func() { h.m.SetMinimised(true) }, func() { h.m.SetMinimised(false) }},
		{"hide", func() { h.m.SetHidden(true) }, func() { h.m.SetHidden(false) }},
	} {
		tc.pause() // returns only once the goroutine is gone
		n := h.samples.Load()
		h.val.Store(h.val.Load() + 5*mb)
		time.Sleep(40 * time.Millisecond)
		if h.samples.Load() != n {
			t.Fatalf("%s: sampled while paused", tc.name)
		}
		before := len(h.got())
		tc.unset()
		waitFor(t, tc.name+" resume emits the change", func() bool { return len(h.got()) > before })
	}

	// minimised AND hidden: one flag clearing is not enough
	h.m.SetMinimised(true)
	h.m.SetHidden(true)
	h.m.SetMinimised(false)
	n := h.samples.Load()
	time.Sleep(30 * time.Millisecond)
	if h.samples.Load() != n {
		t.Fatal("sampled while still hidden")
	}
}

func TestDisableStopsAndReenableEmitsAgain(t *testing.T) {
	h := newHarness(3 * time.Millisecond)
	h.val.Store(10 * mb)
	h.m.SetEnabled(true)
	defer h.m.Close()
	waitFor(t, "first", func() bool { return len(h.got()) == 1 })
	h.m.SetEnabled(false)
	n := h.samples.Load()
	time.Sleep(30 * time.Millisecond)
	if h.samples.Load() != n {
		t.Fatal("sampled while disabled")
	}
	// resuming from a pause with an unchanged value emits nothing, but a new enable does
	h.m.SetEnabled(true)
	waitFor(t, "re-enable emit", func() bool { return len(h.got()) == 2 })
}

func TestCloseStopsGoroutine(t *testing.T) {
	h := newHarness(2 * time.Millisecond)
	h.m.SetEnabled(true)
	waitFor(t, "running", func() bool { return h.samples.Load() > 2 })
	svc := NewMemoryService(h.m)
	if err := svc.ServiceShutdown(); err != nil {
		t.Fatal(err)
	}
	h.m.ctl.Lock()
	stopped := h.m.stop == nil
	h.m.ctl.Unlock()
	if !stopped {
		t.Fatal("goroutine handle still set after shutdown")
	}
	n, e := h.samples.Load(), len(h.got())
	time.Sleep(30 * time.Millisecond)
	if h.samples.Load() != n || len(h.got()) != e {
		t.Fatal("activity after shutdown")
	}
	h.m.SetEnabled(false) // must not restart or hang
	h.m.SetEnabled(true)
	time.Sleep(20 * time.Millisecond)
	if h.samples.Load() != n {
		t.Fatal("restarted after shutdown")
	}
}

func TestNoGoroutineWhileOff(t *testing.T) {
	h := newHarness(time.Millisecond)
	if h.m.stop != nil {
		t.Fatal("goroutine before enable")
	}
	h.m.SetEnabled(true)
	h.m.SetMinimised(true)
	if h.m.stop != nil {
		t.Fatal("goroutine while minimised")
	}
	h.m.Close()
}

func TestSampleErrorEmitsNothing(t *testing.T) {
	var n atomic.Int64
	var emits atomic.Int64
	m := newMonitor(func() (uint64, error) { n.Add(1); return 0, errTest }, func(uint64) { emits.Add(1) }, time.Millisecond, Threshold)
	m.SetEnabled(true)
	waitFor(t, "samples", func() bool { return n.Load() > 3 })
	m.Close()
	if emits.Load() != 0 {
		t.Fatal("emitted after a failed sample")
	}
}

type testErr struct{}

func (testErr) Error() string { return "boom" }

var errTest = testErr{}
