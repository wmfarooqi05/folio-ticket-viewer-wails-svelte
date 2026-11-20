<#
RAM and CPU check for Folio (ticket 15). The 01/07 method: launch the production exe, wait 30 s idle,
then sum private bytes and working set over the whole process tree (folio.exe plus every
msedgewebview2.exe descendant).

  powershell -NoProfile -File scripts\ram-check.ps1                  # all cases, 3 runs each
  powershell -NoProfile -File scripts\ram-check.ps1 -Cases a,c -Runs 1

Cases (each run is a fresh launch):
  a    idle and indexed (this is B)
  b    two documents open: one in the middle pane, one in the side panel
  c    after a Mermaid document (flowchart)
  d    two passes over DIFFERENT documents (50 + 50, or the fixture list split in halves): drift against
       the idle sample, and pass-to-pass drift, which is the leak check
  cpu  average CPU over 30 s with a pulsing in-progress pill on screen (percent of one core)

Isolation: the exe runs with APPDATA and LOCALAPPDATA pointing into a temp folder, so settings.json,
the index cache and the WebView2 profile are throw-away and %APPDATA%\Folio is never touched. The docs
root comes from FOLIO_ROOT and is only read. To open documents it uses the FOLIO_BENCH hook
(internal/shell/bench.go): a command file in a temp folder, no listener.

Every process started is killed at the end of its run, and a final sweep kills anything whose command
line points into the temp folder.
#>
param(
  [string]$Exe = (Join-Path $PSScriptRoot '..\bin\folio.exe'),
  [string]$Docs = (Join-Path $PSScriptRoot '..\fixtures\docs'),
  [string[]]$Cases = @('a', 'b', 'c', 'd', 'cpu'),
  [int]$Runs = 3,
  [int]$IdleSeconds = 30,
  [string]$Out = '',
  [switch]$NoRoot  # do not set FOLIO_ROOT: the first-run screen, for attributing the idle baseline
)
$ErrorActionPreference = 'Stop'
$Cases = @($Cases | ForEach-Object { $_ -split ',' } | Where-Object { $_ })  # -File passes "a,b" as one string
$Exe = (Resolve-Path $Exe).Path
$Docs = (Resolve-Path $Docs).Path
$MB = 1MB

Add-Type -Namespace Win -Name Native -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int n);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);
'@

function Get-Tree([int]$RootPid) {
  $all = Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId
  $ids = [System.Collections.Generic.HashSet[int]]::new()
  [void]$ids.Add($RootPid)
  $grew = $true
  while ($grew) {
    $grew = $false
    foreach ($p in $all) {
      if ($ids.Contains([int]$p.ParentProcessId) -and $ids.Add([int]$p.ProcessId)) { $grew = $true }
    }
  }
  $ids
}

function Measure-Tree([int]$RootPid) {
  $priv = 0.0; $ws = 0.0; $n = 0; $cpu = 0.0; $goPriv = 0.0
  foreach ($id in (Get-Tree $RootPid)) {
    $p = Get-Process -Id $id -ErrorAction SilentlyContinue
    if (-not $p) { continue }
    if ($id -eq $RootPid) { $goPriv = $p.PrivateMemorySize64 }
    $priv += $p.PrivateMemorySize64; $ws += $p.WorkingSet64; $n++
    try { $cpu += $p.TotalProcessorTime.TotalSeconds } catch {}
  }
  [pscustomobject]@{ Private = [math]::Round($priv / $MB, 1); WS = [math]::Round($ws / $MB, 1); Procs = $n; Cpu = $cpu; GoPrivate = [math]::Round($goPriv / $MB, 1) }
}

function Start-Folio([string]$Work) {
  $env:APPDATA = Join-Path $Work 'Roaming'
  $env:LOCALAPPDATA = Join-Path $Work 'Local'
  New-Item -ItemType Directory -Force $env:APPDATA, $env:LOCALAPPDATA, (Join-Path $Work 'bench') | Out-Null
  if ($NoRoot) { Remove-Item Env:FOLIO_ROOT -ErrorAction SilentlyContinue } else { $env:FOLIO_ROOT = $Docs }
  $env:FOLIO_BENCH = '1'
  $env:FOLIO_BENCH_DIR = Join-Path $Work 'bench'
  $log = Join-Path $Work 'folio.log'
  $proc = Start-Process -FilePath $Exe -PassThru -RedirectStandardError $log -RedirectStandardOutput (Join-Path $Work 'out.log')
  $script:Started.Add($proc)  # the final cleanup kills these processes and nothing else
  $t0 = Get-Date
  # wait until the start timings line is in the log: the index is built and the tree shows
  while (((Get-Date) - $t0).TotalSeconds -lt 60) {
    if ($NoRoot) { if ((Test-Path $log) -or ((Get-Date) - $t0).TotalSeconds -gt 3) { Start-Sleep -Seconds 2; break } }
    elseif ((Test-Path $log) -and (Select-String -Path $log -Pattern 'folio.timing:' -Quiet)) { break }
    Start-Sleep -Milliseconds 250
  }
  $ready = ((Get-Date) - $t0).TotalSeconds
  # the window must be on screen, or Chromium throttles it (and the pulse would not run)
  for ($i = 0; $i -lt 20 -and $proc.MainWindowHandle -eq 0; $i++) { Start-Sleep -Milliseconds 250; $proc.Refresh() }
  if ($proc.MainWindowHandle -ne 0) {
    [void][Win.Native]::ShowWindow($proc.MainWindowHandle, 9)
    [void][Win.Native]::SetForegroundWindow($proc.MainWindowHandle)
  }
  [pscustomobject]@{ Proc = $proc; Log = $log; Bench = $env:FOLIO_BENCH_DIR; Ready = [math]::Round($ready, 1); Work = $Work }
}

function Stop-Folio($h) {
  if ($h.Proc -and -not $h.Proc.HasExited) { & taskkill /PID $h.Proc.Id /T /F | Out-Null }
  Start-Sleep -Milliseconds 800
}

function Send-Bench($h, [string[]]$Lines) {
  $f = Join-Path $h.Bench 'cmd.txt'
  $tmp = Join-Path $h.Bench 'cmd.new'
  [IO.File]::WriteAllLines($tmp, $Lines)
  # wait for the previous batch to be taken; never overwrite one nobody has taken
  for ($i = 0; $i -lt 40 -and (Test-Path $f); $i++) { Start-Sleep -Milliseconds 100 }
  if (Test-Path $f) { throw "the previous bench batch was not taken within 4 s ($f)" }
  Move-Item $tmp $f
}

function Wait-Opened($h, [int]$Count, [int]$TimeoutSec = 30) {
  $t0 = Get-Date
  while (((Get-Date) - $t0).TotalSeconds -lt $TimeoutSec) {
    $n = @(Select-String -Path $h.Log -Pattern 'bench: opened').Count
    if ($n -ge $Count) { return $n }
    Start-Sleep -Milliseconds 100
  }
  throw "only $n of $Count documents opened (log: $($h.Log))"
}

function Wait-Idle($h) {
  Start-Sleep -Seconds $IdleSeconds
  Measure-Tree $h.Proc.Id
}

$flow = 'modules/cash-handling-workflow/issues/04-build-movecash.md'
$plain1 = 'modules/one-cash-mover/map.md'
$plain2 = 'modules/cloud-migration/map.md'
$pulse = 'modules/one-cash-mover/issues/05-build-movecash.md'
$mermaidDocs = @('handoffs/ocm-cutover-handoff.md', $flow)
$all = Get-ChildItem -Path $Docs -Recurse -Filter *.md -File |
  ForEach-Object { $_.FullName.Substring($Docs.Length + 1).Replace('\', '/') } |
  Where-Object { $_ -notin $mermaidDocs -and $_ -notmatch '(^|/)_templates/' } | Sort-Object
# case d: 50 + 50 distinct plain documents when there are 100, otherwise the list split in two halves
$k = [math]::Min(50, [math]::Floor($all.Count / 2))
if ($k -lt 10) { throw "need at least 20 plain documents, found $($all.Count)" }
$pass1 = $all | Select-Object -First $k
$pass2 = $all | Select-Object -Skip $k -First $k

$results = [System.Collections.Generic.List[object]]::new()
$script:Started = [System.Collections.Generic.List[System.Diagnostics.Process]]::new()
function Add-Result($case, $run, $extra) {
  $o = [ordered]@{ case = $case; run = $run }
  foreach ($k in $extra.Keys) { $o[$k] = $extra[$k] }
  $results.Add([pscustomobject]$o)
  Write-Host ("{0} run {1}: {2}" -f $case, $run, (($extra.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join '  '))
}

$tmpRoot = Join-Path ([IO.Path]::GetTempPath()) ('folio-ram-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $tmpRoot | Out-Null
$saved = @{ APPDATA = $env:APPDATA; LOCALAPPDATA = $env:LOCALAPPDATA }
try {
  foreach ($case in $Cases) {
    for ($run = 1; $run -le $Runs; $run++) {
      $h = Start-Folio (Join-Path $tmpRoot "$case-$run")
      try {
        switch ($case) {
          'a' {
            $m = Wait-Idle $h
            Add-Result a $run ([ordered]@{ private = $m.Private; ws = $m.WS; procs = $m.Procs; go_private = $m.GoPrivate; ready_s = $h.Ready })
          }
          'b' {
            Send-Bench $h @("open $plain1", "panel $plain2")
            [void](Wait-Opened $h 2)  # the open and the panel each log 'bench: opened'
            $m = Wait-Idle $h
            Add-Result b $run ([ordered]@{ private = $m.Private; ws = $m.WS; procs = $m.Procs })
          }
          'c' {
            Send-Bench $h @("open $flow")
            [void](Wait-Opened $h 1)
            $m = Wait-Idle $h
            Add-Result c $run ([ordered]@{ private = $m.Private; ws = $m.WS; procs = $m.Procs })
          }
          'd' {
            # Pass 1 and pass 2 open DIFFERENT documents ($k each), so the pass-to-pass drift is the leak check:
            # growth that continues over documents never seen before. The first pass also warms the renderer up.
            $pre = Wait-Idle $h
            $n = 0
            foreach ($round in 1, 2) {
              foreach ($doc in $(if ($round -eq 1) { $pass1 } else { $pass2 })) {
                $n++
                Send-Bench $h @("open $doc")
                [void](Wait-Opened $h $n)
                Start-Sleep -Milliseconds 150
              }
              if ($round -eq 1) { $post1 = Wait-Idle $h }
            }
            $post2 = Wait-Idle $h
            Add-Result d $run ([ordered]@{
              docs_per_pass = $k; pre_private = $pre.Private; pass1_private = $post1.Private; pass2_private = $post2.Private
              drift_vs_idle = [math]::Round($post1.Private - $pre.Private, 1); pass_to_pass = [math]::Round($post2.Private - $post1.Private, 1)
              pre_ws = $pre.WS; pass1_ws = $post1.WS; pass2_ws = $post2.WS
            })
          }
          'cpu' {
            Send-Bench $h @("open $pulse")
            [void](Wait-Opened $h 1)
            Start-Sleep -Seconds 10
            $t0 = Measure-Tree $h.Proc.Id
            $w0 = Get-Date
            Start-Sleep -Seconds 30
            $t1 = Measure-Tree $h.Proc.Id
            $wall = ((Get-Date) - $w0).TotalSeconds
            $pct = [math]::Round(100 * ($t1.Cpu - $t0.Cpu) / $wall, 2)
            Add-Result cpu $run ([ordered]@{ cpu_pct_of_one_core = $pct; private = $t1.Private; procs = $t1.Procs })
          }
        }
      } finally { Stop-Folio $h }
    }
  }
} finally {
  $env:APPDATA = $saved.APPDATA; $env:LOCALAPPDATA = $saved.LOCALAPPDATA
  Remove-Item Env:FOLIO_ROOT, Env:FOLIO_BENCH, Env:FOLIO_BENCH_DIR -ErrorAction SilentlyContinue
  # sweep: only what this script started. Never match on the exe path or name: that would also hit any
  # Folio the user is running. The processes come from Start-Process; the tree kill takes the WebView2 children.
  # HasExited is checked on the Process object we started, so a reused PID is never touched.
  foreach ($p in $script:Started) {
    try { if (-not $p.HasExited) { & cmd /c "taskkill /PID $($p.Id) /T /F >nul 2>&1" } } catch {}
  }
  # WebView2 processes can outlive a killed parent; theirs carry our temp folder in the command line
  Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -like "*$tmpRoot*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 1
  Remove-Item -Recurse -Force $tmpRoot -ErrorAction SilentlyContinue
}

function Get-Median($v) { $s = @($v | Sort-Object); $n = $s.Count; if ($n % 2) { $s[($n - 1) / 2] } else { ($s[$n / 2 - 1] + $s[$n / 2]) / 2 } }
Write-Host "`nMedians over $Runs run(s):"
foreach ($g in ($results | Group-Object case)) {
  $props = $g.Group[0].PSObject.Properties.Name | Where-Object { $_ -notin 'case', 'run' }
  $line = foreach ($p in $props) { "{0}={1}" -f $p, [math]::Round((Get-Median ($g.Group | ForEach-Object { $_.$p })), 2) }
  Write-Host ("{0}: {1}" -f $g.Name, ($line -join '  '))
}
if ($Out) { $results | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 $Out }
