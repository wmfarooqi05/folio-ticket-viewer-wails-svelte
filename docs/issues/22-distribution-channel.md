---
type: decision
status: blocked
status_note: null
waiting_on: null
blocked_by: ["20"]
blocked_note: "depends on which install routes company IT allows"
related: ["15", "17", "21", "23"]
superseded_by: null
pr: []
ado: []
afk: false
---

# 22 — How Folio reaches the company VM

## Why

The owner would like to give colleagues one command to install Folio, through Chocolatey, winget or npm. This ticket decides the channel, weighing convenience against what each one actually protects against. It depends on what IT allows (20). The analysis comes from [16-security-assessment.md](../assets/16-security-assessment.md).

## Options

- **winget, public repository.** `winget install Folio` would work for anyone, and Microsoft scans submissions. But it needs a public download URL, and this repo is private, so the binary would have to be published publicly.
- **winget, private source or local manifest.** It checks only the SHA-256 written in your own manifest, which is the same check as `Get-FileHash`. Local manifests need admin to enable, are often disabled by policy, and look like attacker behaviour to endpoint security.
- **Chocolatey.** The community repository is public and moderated, so the same problem as public winget. A private feed only makes sense if the company already runs one. Chocolatey itself is often not installed on company machines.
- **npm.** The package would download or contain the exe. It needs Node on the VM, runs install scripts, and puts Folio on the npm supply chain. This is not a sensible route for a desktop exe.
- **A bare exe plus SHA-256,** copied over a company-approved channel (file share, OneDrive or a GitHub Release), with the hash read from the CI run. This is simple and enough, if IT allowlists the exe.
- **The NSIS installer from ticket 15.** It is a second unsigned binary to approve, so only use it if IT wants an installer.
- **Intune or Company Portal,** possibly as a company-signed MSIX. IT reviews and deploys it, and it clears AppLocker, WDAC and ASR by policy. This is the best route if IT is strict.

## To do

- [ ] Pick the channel once 20 is answered, and record why.
- [ ] Write the install steps for colleagues: the command or the download, the hash check, and first run.
- [ ] If a package-manager route is chosen, write its manifest from the CI release (17), with the SHA-256 pinned.

## Done when

- <a id="ac1"></a>**AC1** — The decision is in the Outcome, and the README has install and verify steps for the chosen channel.

## Outcome

*(empty)*
