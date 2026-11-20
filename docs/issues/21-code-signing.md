---
type: decision
status: blocked
status_note: null
waiting_on: null
blocked_by: ["20"]
blocked_note: "depends on whether IT allowlists by hash or by publisher"
related: ["17", "22"]
superseded_by: null
pr: []
ado: []
afk: false
---

# 21 — Code signing: whether and how

## Why

`bin\folio.exe` is unsigned. A signed exe carries a digital signature from a code-signing certificate. It proves who published the file and that nobody has changed it since. Without one, Windows shows "Unknown publisher" warnings, and IT can only allowlist the exe by its exact hash, which changes with every release. With one, IT can allowlist the publisher once.

Signing does not make the exe trusted straight away. SmartScreen and Defender's prevalence rule still want reputation, and signing vouches only for who built the file, not that the code is safe ([16-security-assessment.md](../assets/16-security-assessment.md)).

## To do

- [ ] Choose an option, based on IT's answer in 20:
  - **No signing:** IT allowlists each release by hash. This is fine for a handful of releases.
  - **Azure Artifact Signing** (formerly Trusted Signing): a cheap cloud service. Public trust covers organisations in the US, Canada, EU and UK, but individuals only in the US and Canada, so check eligibility.
  - **An OV certificate from a certificate authority**, with the key held in a cloud HSM or key vault and never on a laptop.
  - **The company's own certificate authority**, if IT runs one. IT signs the exe or issues a certificate for it.
- [ ] Wire the chosen signing into the CI release (17), so the key never sits on the owner's PC.

## Done when

- <a id="ac1"></a>**AC1** — The decision and its reason are in the Outcome. If signing is chosen, `Get-AuthenticodeSignature folio.exe` shows a valid signature from the expected signer on a CI-built release.

## Open questions

### <a id="q1"></a>Q1 — Is the owner eligible for Azure Artifact Signing (country, organisation or individual)?

## Outcome

*(empty)*
