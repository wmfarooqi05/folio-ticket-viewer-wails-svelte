//go:build windows

package mem

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"testing"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// psTree is the independent read: the same PowerShell as scripts/ram-check.ps1 (Win32_Process
// parent links, then Get-Process PrivateMemorySize64), summed over the tree below a root.
const psTree = `
$all = Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId
$ids = [System.Collections.Generic.HashSet[int]]::new(); [void]$ids.Add(%d)
$grew = $true
while ($grew) { $grew = $false; foreach ($p in $all) { if ($ids.Contains([int]$p.ParentProcessId) -and $ids.Add([int]$p.ProcessId)) { $grew = $true } } }
$sum = 0.0; foreach ($id in $ids) { $p = Get-Process -Id $id -ErrorAction SilentlyContinue; if ($p) { $sum += $p.PrivateMemorySize64 } }
[long]$sum`

func TestSampleTreeMatchesPowerShell(t *testing.T) {
	// cmd.exe starts ping.exe: a two-process tree whose memory is steady.
	cmd := exec.Command("cmd.exe", "/c", "ping", "-n", "40", "127.0.0.1")
	if err := cmd.Start(); err != nil {
		t.Skip(err)
	}
	defer func() { _ = cmd.Process.Kill(); _ = cmd.Wait() }()
	root := uint32(cmd.Process.Pid)

	var tree []uint32
	for i := 0; i < 40; i++ { // wait for the child
		procs, err := snapshot()
		if err != nil {
			t.Fatal(err)
		}
		if tree = Tree(procs, root); len(tree) >= 2 {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	if len(tree) < 2 {
		t.Skip("ping child did not start")
	}
	time.Sleep(300 * time.Millisecond)

	out, err := exec.Command("powershell", "-NoProfile", "-Command", fmt.Sprintf(psTree, root)).Output()
	if err != nil {
		t.Skip("powershell unavailable: ", err)
	}
	want, err := strconv.ParseInt(strings.TrimSpace(string(out)), 10, 64)
	if err != nil {
		t.Fatalf("parse %q: %v", out, err)
	}
	got, err := SampleTree(root)
	if err != nil {
		t.Fatal(err)
	}
	diff := int64(got) - want
	t.Logf("go=%d bytes  powershell=%d bytes  diff=%d", got, want, diff)
	if diff < -(256<<10) || diff > 256<<10 {
		t.Fatalf("Go and PowerShell disagree by %d bytes", diff)
	}
}

func TestSampleOwnTree(t *testing.T) {
	s := NewSampler()
	v, err := s.Sample()
	if err != nil || v < 1<<20 {
		t.Fatalf("Sample = %d, %v", v, err)
	}
	if s.tree == nil {
		t.Fatal("the first sample must be a full scan")
	}
	if v2, err := s.Sample(); err != nil || v2 < 1<<20 { // the cached path
		t.Fatalf("cached Sample = %d, %v", v2, err)
	}
}

// Every handle a sample opens is closed: the process handle count does not grow.
func TestSamplesLeakNoHandles(t *testing.T) {
	count := func() uint32 {
		var n uint32
		p := windows.NewLazySystemDLL("kernel32.dll").NewProc("GetProcessHandleCount")
		if r, _, err := p.Call(uintptr(windows.CurrentProcess()), uintptr(unsafe.Pointer(&n))); r == 0 {
			t.Fatal(err)
		}
		return n
	}
	s := NewSampler()
	_, _ = s.Sample()
	before := count()
	for i := 0; i < 20; i++ {
		_, _ = s.Sample() // cached
	}
	for i := 0; i < 5; i++ {
		_, _ = SampleTree(uint32(os.Getpid())) // full scans
	}
	if after := count(); after > before+2 {
		t.Fatalf("handles grew from %d to %d", before, after)
	}
}

// A new child is found by the next full scan; an exited one forces a full scan at once.
func TestSamplerFollowsTheTree(t *testing.T) {
	cmd := exec.Command("cmd.exe", "/c", "ping", "-n", "30", "127.0.0.1")
	if err := cmd.Start(); err != nil {
		t.Skip(err)
	}
	defer func() { _ = cmd.Process.Kill(); _ = cmd.Wait() }()
	time.Sleep(500 * time.Millisecond)

	s := &Sampler{root: uint32(cmd.Process.Pid)}
	full, err := s.Sample()
	if err != nil || len(s.tree) < 2 {
		t.Fatalf("full scan: %d, %v, %d members", full, err, len(s.tree))
	}
	cached, err := s.Sample()
	if err != nil || cached < full-(256<<10) || cached > full+(256<<10) {
		t.Fatalf("cached %d vs full %d, %v", cached, full, err)
	}
	// the root is killed: the cached path notices and the full scan finds nothing left
	_ = cmd.Process.Kill()
	_ = cmd.Wait()
	time.Sleep(100 * time.Millisecond)
	// (the orphaned ping keeps its dead parent's PID, so it is still in the tree, as in ram-check)
	if _, err := s.Sample(); err != nil {
		t.Fatal(err)
	}
	for _, m := range s.tree {
		if m.pid == s.root {
			t.Fatalf("the exited root is still a member: %v", s.tree)
		}
	}
	if len(s.tree) != 1 {
		t.Fatalf("want the orphaned ping only, got %v", s.tree)
	}
}

func BenchmarkSample(b *testing.B) {
	b.ReportAllocs()
	s := NewSampler()
	_, _ = s.Sample() // the full scan; the loop measures the samples in between
	cpu0 := cpuTime()
	for i := 0; i < b.N; i++ {
		if _, err := s.Sample(); err != nil {
			b.Fatal(err)
		}
	}
	b.ReportMetric(float64((cpuTime()-cpu0).Nanoseconds())/float64(b.N), "cpu-ns/op")
}

// BenchmarkSampleFull is the once-a-minute full scan.
func BenchmarkSampleFull(b *testing.B) {
	b.ReportAllocs()
	pid := uint32(os.Getpid())
	cpu0 := cpuTime()
	for i := 0; i < b.N; i++ {
		if _, err := SampleTree(pid); err != nil {
			b.Fatal(err)
		}
	}
	b.ReportMetric(float64((cpuTime()-cpu0).Nanoseconds())/float64(b.N), "cpu-ns/op")
}

// cpuTime is this process's user+kernel CPU time, which is what a sample costs the machine.
func cpuTime() time.Duration {
	var c, e, k, u windows.Filetime
	_ = windows.GetProcessTimes(windows.CurrentProcess(), &c, &e, &k, &u)
	return time.Duration(k.Nanoseconds() + u.Nanoseconds())
}

// referenceTree is the first design from the brief: Toolhelp snapshot, then OpenProcess and
// GetProcessMemoryInfo per process. It is the documented Win32 route and the cross-check for
// the production NtQuerySystemInformation path. It costs about 50 ms of CPU per call.
func referenceTree(root uint32) (uint64, error) {
	h, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return 0, err
	}
	defer windows.CloseHandle(h)
	var e windows.ProcessEntry32
	e.Size = uint32(unsafe.Sizeof(e))
	if err := windows.Process32First(h, &e); err != nil {
		return 0, err
	}
	var procs []Proc
	for {
		procs = append(procs, Proc{PID: e.ProcessID, Parent: e.ParentProcessID})
		if windows.Process32Next(h, &e) != nil {
			break
		}
	}
	var total uint64
	for _, pid := range Tree(procs, root) {
		total += referencePrivate(pid)
	}
	return total, nil
}

// countersEx is PROCESS_MEMORY_COUNTERS_EX.
type countersEx struct {
	CB, PageFaultCount uint32
	Sizes              [8]uintptr // peak/current working set, quotas, pagefile usage and peak
	Private            uintptr
}

var getProcessMemoryInfo = windows.NewLazySystemDLL("kernel32.dll").NewProc("K32GetProcessMemoryInfo")

func referencePrivate(pid uint32) uint64 {
	h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		return 0
	}
	defer windows.CloseHandle(h)
	var c countersEx
	c.CB = uint32(unsafe.Sizeof(c))
	if r, _, _ := getProcessMemoryInfo.Call(uintptr(h), uintptr(unsafe.Pointer(&c)), uintptr(c.CB)); r == 0 {
		return 0
	}
	return uint64(c.Private)
}

func TestMatchesGetProcessMemoryInfo(t *testing.T) {
	cmd := exec.Command("cmd.exe", "/c", "ping", "-n", "20", "127.0.0.1")
	if err := cmd.Start(); err != nil {
		t.Skip(err)
	}
	defer func() { _ = cmd.Process.Kill(); _ = cmd.Wait() }()
	time.Sleep(500 * time.Millisecond)
	root := uint32(cmd.Process.Pid)
	want, err := referenceTree(root)
	if err != nil {
		t.Fatal(err)
	}
	got, err := SampleTree(root)
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("NtQuerySystemInformation %d != GetProcessMemoryInfo %d", got, want)
	}
}

func BenchmarkReferenceToolhelp(b *testing.B) {
	pid := uint32(os.Getpid())
	cpu0 := cpuTime()
	for i := 0; i < b.N; i++ {
		if _, err := referenceTree(pid); err != nil {
			b.Fatal(err)
		}
	}
	b.ReportMetric(float64((cpuTime()-cpu0).Nanoseconds())/float64(b.N), "cpu-ns/op")
}
