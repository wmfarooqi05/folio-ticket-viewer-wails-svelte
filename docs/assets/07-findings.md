# Ticket 07 findings: WebView2 tuning in Wails v3.1.0

Nov 20, 2026. The spike code was in `prototypes/07-webview2-tuning/`, a throwaway that is not in the repo.

## Headline

- **The only big, safe win is turning the GPU off.** `--disable-gpu --disable-gpu-compositing` cuts private memory from about 236 MB to about 160 MB (-75 MB, about -32%), with no measurable CPU cost.
- **The "Low" memory target only trims Working Set.** It drops from about 405 MB to about 70 MB, but private memory is unchanged.
- **`--single-process` is the lowest, but not usable.** It reaches about 120 MB private, but Chromium does not support it.

## What Wails v3.1.0 exposes on Windows

- **`application.WindowsOptions`** has these fields:
  - `AdditionalBrowserArgs []string`. Each entry needs the `--` prefix.
  - `EnabledFeatures []string` and `DisabledFeatures []string`. Wails builds `--enable-features=` and `--disable-features=` from them.
  - `WebviewUserDataPath` and `WebviewBrowserPath`.
- **Wails always injects `--disable-features=msSmartScreenProtection`.** Put further disabled features in `DisabledFeatures`, not in `AdditionalBrowserArgs`, because a second `--disable-features` flag would override it.
- **`WebviewGpuPolicy` does nothing on Windows.** It is Linux only, so GPU off needs a flag.
- **`MemoryUsageTargetLevel` is not exposed.**
  - The COM wrapper is in Wails' `internal` package, so it cannot be imported.
  - It worked only with a patched local Wails, wired in with a `replace` directive.
  - It must be called on the UI thread with `application.InvokeSync`.
- **The env var `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` is ignored under Wails.** The GPU process's command line did not contain the flag. The cause is unconfirmed. Use the Go option.
- **Go-side tuning does nothing.** `GOGC`, `GOMEMLIMIT` and `debug.SetMemoryLimit` all work, but they moved nothing: the shell is about 60 MB private, mostly runtime and libraries.

## Measurements

- **Method:** as in 01. A production build with `TICKET_ROOT` set to 428 files, 30 s idle, and the app plus all descendant processes summed. Each variant was run twice.
- **Process count:** 7 processes unless noted.
- **Machine state:** about 20 other apps' WebView2 processes were running, as in 01.

| Variant | Run 1 WS / Priv (MB) | Run 2 WS / Priv (MB) | Notes |
|---|---|---|---|
| A0 baseline | 403.9 / 235.7 | 404.2 / 235.5 | 01 reported 430 / 241 |
| A1 baseline + CSS pulsing dot | 405.3 / 239.8 | 408.0 / 242.8 | CPU 5.0% and 3.1% of one core |
| B1 `--renderer-process-limit=1` | 404.4 / 235.5 | 404.5 / 240.3 | no effect |
| B2 `--single-process` | 264.5 / 151.8 | 261.4 / 150.3 | 3 processes; unsupported |
| C1 `--disable-gpu` | 358.8 / 160.0 | 359.7 / 165.8 | |
| C2 `--disable-gpu --disable-gpu-compositing` | 357.4 / 161.0 | 359.5 / 164.1 | |
| D1 disable-features list | 410.2 / 241.1 | 406.9 / 240.6 | no effect |
| D2 spellcheck, bg-network, sync, component-update, breakpad flags | 400.7 / 234.3 | 405.6 / 236.1 | noise |
| D3 D1 + D2 | 400.6 / 232.9 | 403.8 / 233.9 | noise |
| E1 `--js-flags=--max-old-space-size=64` | 404.8 / 238.1 | 409.7 / 239.2 | no effect |
| E2 js heap 32, semi-space 1, `--lite-mode` | 405.9 / 239.3 | 404.6 / 238.1 | no effect |
| F1–F3 Go memory limit, GOGC | about 404 / 236 to 242 | about 404 / 236 to 239 | no effect |
| G1 env var `--disable-gpu` | 404.7 / 236.1 | 404.5 / 238.7 | not applied |
| H3 minimised only | 408.6 / 235.9 | 422.6 / 242.7 | no trim |
| H1 MemoryUsageTargetLevel Low, visible | **80.4** / 237.5 | **67.9** / 237.7 | WS collapses, Private unchanged |
| H2 Low + minimised | **66.3** / 235.6 | **66.9** / 250.7 | |
| I1 no site isolation | 422.8 / 241.9 | 416.6 / 239.2 | slightly worse |
| I2 `--in-process-gpu --disable-gpu` | 333.8 / 155.8 | 329.8 / 150.8 | 6 processes |
| **J1 combo:** GPU off, compositing off, D1, D2 | 356.8 / 156.6 | 359.2 / 161.0 | recommended |
| J2 J1 + js heap 64 + Low (visible) | 67.9 / 157.3 | 82.7 / 158.8 | |
| J3 J1 + `--single-process` | 235.8 / 119.3 | 236.3 / 120.5 | 3 processes; unsupported |
| J5 J1 + pulsing dot | 360.2 / 157.7 | 483.8 / 182.7 | run 2 was an outlier; CPU 3.1% and 0.5% |

### Edge `--app` window, like for like

The same built frontend was served by a stub Go server, in a fresh Edge profile with no Edge running beforehand.

| Edge variant | Run 1 WS / Priv | Run 2 WS / Priv |
|---|---|---|
| no flags | 503.0 / 262.9 | 538.3 / 264.0 |
| GPU off | 490.0 / 183.4 | 485.3 / 183.4 |
| GPU off + spellcheck, sync and bg-network flags + features | 358.8 / 125.3 | 361.3 / 125.8 |

- **Wails untuned (236 private) is slightly below Edge untuned (263).**
- **Tuned Edge (125) beats tuned Wails (157).** That is roughly the Go shell's 59 MB, though the cause was not isolated.
- **The marginal cost with Edge already running** was not cleanly isolated.

## Recommended flag set (apply in Go)

```go
Windows: application.WindowsOptions{
    DisabledFeatures: []string{
        "SpareRendererForSitePerProcess", "Translate", "TranslateUI",
        "OptimizationHints", "OptimizationGuideModelDownloading", "MediaRouter",
        "AutofillServerCommunication", "msEdgeShopping", "msEdgeSidebar",
    },
    AdditionalBrowserArgs: []string{
        "--disable-gpu", "--disable-gpu-compositing",
        "--disable-spell-checking", "--disable-component-update",
        "--disable-background-networking", "--disable-sync", "--no-pings",
        "--disable-breakpad",
    },
},
```

Do not use `--renderer-process-limit` (no effect), `--disable-site-isolation-trials` (worse) or `--single-process` (unsupported; a renderer crash would take down the whole app).

## Side effects

- **CPU:** an infinite CSS animation costs about 3 to 5% of one core per animated element, with or without the GPU. 03 D2 already limits the pulse to a few elements; measure it with the real UI.
- **Startup:** the UI rendered about 1 s after launch, with no slowdown seen from the flags.

## Not verified

- A visual check for glitches with the GPU off.
- The folder picker under the flags.
- Whether WS climbs back after the Low target is set, and whether input latency suffers.
- Long-term stability of single-process mode.
- Which disabled-feature names actually exist in WebView2 157. Unknown names are silently ignored.
- The workload with the real UI rather than the file list.
