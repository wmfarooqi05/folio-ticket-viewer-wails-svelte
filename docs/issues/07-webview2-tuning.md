---
type: spike
status: in-progress
status_note: "claimed by Claude, Nov 19, 2026"
waiting_on: null
blocked_by: []
blocked_note: null
related: ["01"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 07 — Can WebView2 be tuned well below 240 MB?

Label: wayfinder:prototype

## Why

[01](01-wails-shell.md) measured about 240 MB private at idle, and about 90% of it is WebView2. RAM is the owner's top priority. Find out what tuning buys before accepting the number or changing the stack.

## To do

- [ ] Check what Wails v3.1.0 exposes for WebView2: additional browser arguments, environment options, and `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`.
- [ ] Measure each variant against the 01 baseline, the same way 01 did:
  - a renderer-process limit;
  - GPU off;
  - unused features disabled (for example spell-check and the translate service);
  - background throttling;
  - `MemoryUsageTargetLevel = Low` when minimised or blurred, if it is reachable;
  - a Go GC memory limit for the shell process.
- [ ] Measure a Chrome tab or Edge `--app` window showing the same frontend, for a like-for-like comparison.
- [ ] Note any side effects: rendering glitches, slower start, broken dialogs, and the CPU cost of the continuous animations in [03](03-ui-design.md) D2.

## Done when

- <a id="ac1"></a>**AC1** — A table of variants with private and working-set totals, against baseline and a browser tab.
- <a id="ac2"></a>**AC2** — A recommended flag set, and whether it is applied from Go code or by environment variable.

## Outcome

*(empty)*
