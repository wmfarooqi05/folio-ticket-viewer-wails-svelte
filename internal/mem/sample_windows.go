//go:build windows

package mem

import (
	"os"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// FullEvery is how often a Sampler lists every process on the machine again to find new
// children. Between full scans it only re-reads the processes it already knows.
const FullEvery = 60 * time.Second

// processMemoryCountersEx is PROCESS_MEMORY_COUNTERS_EX.
type processMemoryCountersEx struct {
	CB                         uint32
	PageFaultCount             uint32
	PeakWorkingSetSize         uintptr
	WorkingSetSize             uintptr
	QuotaPeakPagedPoolUsage    uintptr
	QuotaPagedPoolUsage        uintptr
	QuotaPeakNonPagedPoolUsage uintptr
	QuotaNonPagedPoolUsage     uintptr
	PagefileUsage              uintptr
	PeakPagefileUsage          uintptr
	PrivateUsage               uintptr
}

var procGetProcessMemoryInfo = windows.NewLazySystemDLL("kernel32.dll").NewProc("K32GetProcessMemoryInfo")

type member struct {
	pid     uint32
	created windows.Filetime // with the PID, tells a reused PID from the process we saw
}

// Sampler measures the private bytes of one process and all its descendants: the number
// scripts/ram-check.ps1 sums (Process.PrivateMemorySize64, which is
// PROCESS_MEMORY_COUNTERS_EX.PrivateUsage).
//
// Listing every process is the expensive part: Toolhelp, EnumProcesses and
// NtQuerySystemInformation each cost 20 to 50 ms of CPU on a 480-process machine (the kernel
// gathers every thread), and NtGetNextProcess also walks exited processes other programs still
// hold handles to. So the full list is taken once per FullEvery (and whenever a known process
// has exited); the samples in between re-read only the few known processes, a fraction of a
// millisecond. A child started in between is counted from the next full scan.
type Sampler struct {
	root     uint32
	tree     []member
	lastFull time.Time
}

// NewSampler measures this process and its descendants.
func NewSampler() *Sampler { return &Sampler{root: uint32(os.Getpid())} }

// Sample returns the total private bytes.
func (s *Sampler) Sample() (uint64, error) {
	if s.tree != nil && time.Since(s.lastFull) < FullEvery {
		if total, ok := s.cached(); ok {
			return total, nil
		}
	}
	return s.full()
}

// SampleTree measures root's tree once, from scratch.
func SampleTree(root uint32) (uint64, error) { return (&Sampler{root: root}).full() }

func (s *Sampler) full() (uint64, error) {
	procs, err := snapshot()
	if err != nil {
		return 0, err
	}
	s.tree = s.tree[:0]
	var total uint64
	for _, pid := range Tree(procs, s.root) {
		h, ok := openLimited(pid)
		if !ok {
			continue
		}
		if created, live := startTime(h); live {
			s.tree = append(s.tree, member{pid, created})
			total += privateUsage(h)
		}
		windows.CloseHandle(h)
	}
	s.lastFull = time.Now()
	return total, nil
}

// cached re-reads the known processes. ok is false when one of them is gone or was replaced,
// which asks for a full scan.
func (s *Sampler) cached() (uint64, bool) {
	var total uint64
	for _, m := range s.tree {
		h, ok := openLimited(m.pid)
		if !ok {
			return 0, false
		}
		created, live := startTime(h)
		if !live || created != m.created {
			windows.CloseHandle(h)
			return 0, false
		}
		total += privateUsage(h)
		windows.CloseHandle(h)
	}
	return total, true
}

// snapshot lists the processes that can be opened, with their parent PIDs.
func snapshot() ([]Proc, error) {
	pids := make([]uint32, 1024)
	for {
		var n uint32
		if err := windows.EnumProcesses(pids, &n); err != nil {
			return nil, err
		}
		if count := int(n) / 4; count < len(pids) {
			pids = pids[:count]
			break
		}
		pids = make([]uint32, len(pids)*2) // the list may have been cut short
	}
	procs := make([]Proc, 0, len(pids))
	for _, pid := range pids {
		if pid == 0 {
			continue
		}
		h, ok := openLimited(pid)
		if !ok { // other users' and protected processes cannot be Folio's children
			continue
		}
		var pbi windows.PROCESS_BASIC_INFORMATION
		var ret uint32
		if windows.NtQueryInformationProcess(h, windows.ProcessBasicInformation, unsafe.Pointer(&pbi), uint32(unsafe.Sizeof(pbi)), &ret) == nil {
			procs = append(procs, Proc{PID: pid, Parent: uint32(pbi.InheritedFromUniqueProcessId)})
		}
		windows.CloseHandle(h)
	}
	return procs, nil
}

func openLimited(pid uint32) (windows.Handle, bool) {
	h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	return h, err == nil
}

// startTime returns the creation time, and false when the process has already exited
// (a handle can outlive its process).
func startTime(h windows.Handle) (windows.Filetime, bool) {
	var created, exited, kernel, user windows.Filetime
	if err := windows.GetProcessTimes(h, &created, &exited, &kernel, &user); err != nil {
		return created, false
	}
	var code uint32
	if err := windows.GetExitCodeProcess(h, &code); err != nil || code != 259 { // STILL_ACTIVE
		return created, false
	}
	return created, true
}

func privateUsage(h windows.Handle) uint64 {
	var c processMemoryCountersEx
	c.CB = uint32(unsafe.Sizeof(c))
	if r, _, _ := procGetProcessMemoryInfo.Call(uintptr(h), uintptr(unsafe.Pointer(&c)), uintptr(c.CB)); r == 0 {
		return 0
	}
	return uint64(c.PrivateUsage)
}
