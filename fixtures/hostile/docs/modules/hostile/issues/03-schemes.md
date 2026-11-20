---
type: build
status: open
---

# 03 — Every URI scheme

## As Markdown links

- [javascript](javascript:alert(1))
- [data html](data:text/html,<script>alert(1)</script>)
- [data png](data:image/png;base64,iVBORw0KGgo=)
- [vbscript](vbscript:msgbox(1))
- [file local](file:///C:/Windows/win.ini)
- [file unc](file://evil/share/x.md)
- [file unc 4 slashes](file:////evil/share/x.md)
- [unc backslash](\\evil\share\x.md)
- [unc forward](//evil/share/x.md)
- [unc mixed](\/evil/share/x.md)
- [device](\\?\C:\Windows\win.ini)
- [device dot](\\.\pipe\evil)
- [smb](smb://evil/share)
- [vscode open](vscode://file/C:/Windows/System32/drivers/etc/hosts)
- [vscode git clone](vscode://vscode.git/clone?url=https://evil.example/repo.git)
- [vscode insiders](vscode-insiders://file/C:/x)
- [ms-officecmd](ms-officecmd:{"id":3,"LocalProviders.LaunchOfficeAppForResult":{}})
- [ms-msdt](ms-msdt:/id PCWDiagnostic /skip force /param "IT_RebrowseForFile=?")
- [search-ms](search-ms:query=x&crumb=location:\\evil\share)
- [ms-settings](ms-settings:privacy)
- [ms-word](ms-word:ofe|u|https://evil.example/doc.docx)
- [ms-excel](ms-excel:ofv|u|\\evil\share\x.xlsx)
- [ms-appinstaller](ms-appinstaller:?source=https://evil.example/x.appinstaller)
- [mailto](mailto:x@evil.example?subject=hi&body=secret)
- [tel](tel:+15555550100)
- [ftp](ftp://evil.example/x)
- [ldap](ldap://evil.example/x)
- [jar](jar:https://evil.example/x.jar!/)
- [view-source](view-source:https://evil.example/)
- [blob](blob:https://evil.example/uuid)
- [intent](intent://evil#Intent;scheme=https;end)
- [chrome](chrome://settings)
- [edge](edge://settings)
- [about](about:blank)
- [ws](ws://evil.example/socket)
- [credentials](https://user:pass@evil.example/)
- [unsafe query](https://evil.example/?q=<x>"y")
- [no host](https:///evil.example)
- [http](http://evil.example/plain-http)
- [https](https://evil.example/plain-https)
- [ip](http://169.254.169.254/latest/meta-data/)
- [localhost](http://127.0.0.1:1/api/setConfig)
- [protocol-relative](//evil.example/x)

## As autolinks

<javascript:alert(1)> <file:///C:/Windows/win.ini> <vscode://vscode.git/clone?url=https://evil.example> <ms-officecmd:x> <mailto:x@evil.example> <https://evil.example/autolink>

## As bare text (linkify)

file:///C:/Windows/win.ini vscode://file/C:/x javascript:alert(1) \\evil\share\x https://evil.example/bare www.evil.example evil.example x@evil.example
