---
type: task
status: open
status_note: "the owner asks company IT; no code"
waiting_on: owner
blocked_by: []
blocked_note: null
related: ["21", "22", "23"]
superseded_by: null
pr: []
ado: []
afk: false
---

# 20 — Find out what company IT allows

## Why

The biggest blocker to running Folio on the company VM is the company's policy, not attackers. A new, unsigned exe in `%LOCALAPPDATA%` is exactly what AppLocker, WDAC and Defender's attack-surface-reduction rules are built to stop ([16-security-assessment.md](../assets/16-security-assessment.md), "Getting it onto the company VM"). Signing (21) and the install channel (22) both depend on the answers, so ask before building anything for it.

## To do

- [ ] Ask IT, and record the answers here:
  - Can an unlisted exe run from the user profile (`%LOCALAPPDATA%`), or only from `C:\Program Files`? Is AppLocker or WDAC enforced?
  - Is the Defender ASR rule "Block executable files from running unless they meet a prevalence, age, or trusted list criterion" in block mode?
  - Which route do they accept: a hash allowlist, a publisher (signing certificate) allowlist, an Intune / Company Portal package, or a company-signed MSIX?
  - Are winget, Chocolatey or npm allowed on the VM? Is there an internal package feed?
  - Is the WebView2 Runtime installed on the VM? Does the VM have internet access?
  - What Windows diagnostic-data level is set, and are Windows Error Reporting dumps collected?
  - Is a software request or security review required, and who signs it off?
- [ ] Give IT a one-page note:
  - what Folio is: a read-only Markdown viewer;
  - that it makes no network calls;
  - what it writes: `settings.json`, the index cache and the WebView2 profile;
  - where it runs from;
  - the source repo and how releases are built (17).

## Done when

- <a id="ac1"></a>**AC1** — Each question above has IT's answer in the Outcome, and it is clear which install routes are allowed.

## Outcome

*(empty)*
