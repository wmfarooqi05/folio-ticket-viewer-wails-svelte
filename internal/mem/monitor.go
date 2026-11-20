package mem

import (
	"sync"
	"time"
)

// Event is the Wails event Go emits with the new total, in bytes.
const Event = "mem:changed"

const (
	// Interval is the polling period.
	Interval = 5 * time.Second
	// Threshold is how far the total must move from the last emitted value to emit again.
	Threshold = 1 << 20
)

// Monitor polls from one goroutine, and only while it is wanted: enabled (the showMemory
// setting) and neither minimised nor hidden. Otherwise no goroutine exists and no timer runs.
type Monitor struct {
	sample    func() (uint64, error)
	emit      func(uint64)
	interval  time.Duration
	threshold uint64

	ctl       sync.Mutex // guards the fields below
	enabled   bool
	minimised bool
	hidden    bool
	closed    bool
	stop      chan struct{}
	done      chan struct{}

	// last and haveLast belong to the polling goroutine, and to ctl holders while no
	// goroutine runs (the done channel orders the two).
	last     uint64
	haveLast bool
}

// NewMonitor returns an idle monitor that emits through emit.
func NewMonitor(emit func(uint64)) *Monitor {
	return newMonitor(NewSampler().Sample, emit, Interval, Threshold)
}

func newMonitor(sample func() (uint64, error), emit func(uint64), interval time.Duration, threshold uint64) *Monitor {
	return &Monitor{sample: sample, emit: emit, interval: interval, threshold: threshold}
}

// SetEnabled turns polling on or off. Turning it on emits the current total at once, so a
// freshly shown readout is never empty.
func (m *Monitor) SetEnabled(on bool) {
	m.ctl.Lock()
	defer m.ctl.Unlock()
	if on == m.enabled {
		return
	}
	m.enabled = on
	m.apply(true)
}

// SetMinimised pauses polling while the window is minimised.
func (m *Monitor) SetMinimised(v bool) { m.setFlag(&m.minimised, v) }

// SetHidden pauses polling while the window is hidden.
func (m *Monitor) SetHidden(v bool) { m.setFlag(&m.hidden, v) }

func (m *Monitor) setFlag(flag *bool, v bool) {
	m.ctl.Lock()
	defer m.ctl.Unlock()
	if *flag == v {
		return
	}
	*flag = v
	m.apply(false)
}

// Close stops the goroutine and waits for it. The monitor cannot be restarted.
func (m *Monitor) Close() {
	m.ctl.Lock()
	defer m.ctl.Unlock()
	m.closed = true
	m.apply(false)
}

// apply starts or stops the goroutine to match the state. Caller holds ctl. forget drops the
// last emitted value, so the next sample always emits.
func (m *Monitor) apply(forget bool) {
	want := m.enabled && !m.minimised && !m.hidden && !m.closed
	if m.stop != nil && !want {
		close(m.stop)
		<-m.done
		m.stop, m.done = nil, nil
	}
	if forget {
		m.haveLast = false
	}
	if want && m.stop == nil {
		m.stop, m.done = make(chan struct{}), make(chan struct{})
		go m.run(m.stop, m.done)
	}
}

func (m *Monitor) run(stop <-chan struct{}, done chan<- struct{}) {
	defer close(done)
	t := time.NewTicker(m.interval)
	defer t.Stop()
	for {
		m.poll(stop)
		select {
		case <-stop:
			return
		case <-t.C:
		}
	}
}

func (m *Monitor) poll(stop <-chan struct{}) {
	v, err := m.sample()
	if err != nil {
		return
	}
	select {
	case <-stop: // never emit after a stop was requested
		return
	default:
	}
	if m.haveLast && absDiff(v, m.last) < m.threshold {
		return
	}
	m.last, m.haveLast = v, true
	m.emit(v)
}

func absDiff(a, b uint64) uint64 {
	if a > b {
		return a - b
	}
	return b - a
}

// MemoryService is what Wails binds: one method, so the frontend can switch the readout on or off.
// Pausing while the window is minimised or hidden is wired from Go (Attach), not the frontend.
type MemoryService struct{ m *Monitor }

// NewMemoryService wraps m.
func NewMemoryService(m *Monitor) *MemoryService { return &MemoryService{m: m} }

// SetEnabled follows the showMemory setting.
func (s *MemoryService) SetEnabled(on bool) { s.m.SetEnabled(on) }

// ServiceShutdown stops the polling goroutine when the app exits.
func (s *MemoryService) ServiceShutdown() error {
	s.m.Close()
	return nil
}
