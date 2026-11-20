---
type: verify
status: blocked
status_note: null
waiting_on: null
blocked_by: ["16", "17", "20", "22"]
blocked_note: "needs the hardened CI build, IT's answer and a chosen channel; 21 too if signing is chosen"
related: ["15", "18", "19", "21"]
superseded_by: null
pr: []
ado: []
afk: false
---

# 23 — First install on the company VM

## Why

This is the last step. It puts the hardened, CI-built Folio on the company VM through the channel IT agreed, and checks it there before it ever sees real company docs. It also carries ticket 15's AC3: v1 running on the VM against the real repo, with cold and warm start times recorded.

## To do

- [ ] Get the release from CI (17) through the chosen channel (22), and get the expected SHA-256 separately, for example from the Actions run page read on another device.
- [ ] On the VM, verify the file:
  ```powershell
  Get-FileHash .\folio.exe -Algorithm SHA256
  Get-AuthenticodeSignature .\folio.exe | Format-List
  Get-Item .\folio.exe -Stream Zone.Identifier -ErrorAction SilentlyContinue
  ```
- [ ] Place it where IT allows.
- [ ] First run against a copy of `fixtures\` before the real docs. Check that right-click, F12 and Ctrl+Shift+I do nothing. Check that it opens no outbound connections:
  ```powershell
  Get-NetTCPConnection | ? OwningProcess -in (Get-Process folio,msedgewebview2).Id
  ```
- [ ] Point it at the real `docs/`. Record the cold and warm start times, and the idle RAM from the sidebar readout (if it is enabled) or from `scripts/ram-check.ps1`.

## Done when

- <a id="ac1"></a>**AC1** — The hash, and the signature if there is one, match on the VM.
- <a id="ac2"></a>**AC2** — No outbound connections are seen during a session.
- <a id="ac3"></a>**AC3** — Folio runs against the real repo, with the start times and RAM recorded here. This closes ticket 15's AC3.

## Outcome

*(empty)*
