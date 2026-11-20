---
type: build
status: open
---

# 04 — Image and link paths

## Images that would reach the network

![unc](\\evil\share\unc.png)
![unc forward](//evil/share/unc-forward.png)
![unc mixed](\/evil/share/unc-mixed.png)
![unc encoded](%5c%5cevil%5cshare%5cunc-encoded.png)
![unc in a segment](a/%5c%5cevil%5cshare%5cx.png)
![file unc](file://evil/share/file-unc.png)
![file local](file:///C:/Windows/Web/Screen/img100.jpg)
![device](\\?\UNC\evil\share\device.png)
![device dot](\\.\UNC\evil\share\device-dot.png)
![http](https://evil.example/beacon.png)
![http upper](HTTPS://evil.example/beacon-upper.png)
![protocol relative](//evil.example/beacon-pr.png)
![smb](smb://evil/share/x.png)

## Images that would leave the docs root or reach a device

![drive](C:/Windows/Web/Screen/img100.jpg)
![drive relative](C:img100.jpg)
![dotdot](../../../../../../Windows/Web/Screen/img100.jpg)
![dotdot backslash](..\..\..\..\..\Windows\x.png)
![dotdot encoded](%2e%2e/%2e%2e/%2e%2e/%2e%2e/x.png)
![dotdot encoded slash](..%2f..%2f..%2f..%2fx.png)
![encoded slash to the api](..%2f..%2f..%2f..%2fapi%2fevents)
![encoded backslash](img%5c..%5c..%5cx.png)
![dotdot upper](%2E%2E/%2E%2E/%2E%2E/x.png)
![rooted](/../../x.png)
![doc prefix](/doc/../../x.png)
![ads](diagram.png::$DATA)
![ads named](diagram.png:hidden.png)
![con](CON.png)
![aux in a folder](img/aux.png)
![com1](COM1.jpg)
![nul with dots](NUL.tar.png)
![short name](PROGRA~1/x.png)
![short name 2](../../../../PROGRA~1/x.png)
![trailing dot](diagram.png.)
![trailing space](<diagram.png >)
![nul byte](x%00.png)
![query](x.png?https://evil.example/)
![fragment](x.png#//evil.example)
![angle](<\\evil\share\angle.png>)
![svg](diagram.svg)

## Links that would leave the docs root

- [dotdot md](../../../../../../Windows/win.ini.md)
- [dotdot backslash](..\..\..\..\..\x.md)
- [encoded](%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/x.md)
- [drive](C:/Windows/x.md)
- [unc md](\\evil\share\x.md)
- [ads md](01-html-svg.md::$DATA)
- [con md](CON.md)
- [short name](..\..\..\..\PROGRA~1\x.md)
- [rooted](/../../../x.md)
