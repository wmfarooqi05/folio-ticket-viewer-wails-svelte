# folio-issues-kanban-viewer

A read-only viewer for Markdown tickets. It starts a small web server on your own machine
and opens your browser. No exe, no dependencies: only Node 22 or newer.

```
npx folio-issues-kanban-viewer --docs <path>
```

`<path>` is the repo root, or its docs folder (the one that holds `modules/`, `handoffs/`, `patterns/`).

Or install it once:

```
npm install -g folio-issues-kanban-viewer
folio-issues-kanban-viewer --docs <path>      # or the short name: folio --docs <path>
```

(`folio-issues-kanban-viewer` is the safe name: another npm package called `folio` also installs a `folio` command, and
two global installs would clash.)

| Option | |
|---|---|
| `--docs <path>` | the repo root or docs folder. Without it, the page asks for a path. |
| `--port <n>` | listen on this port. Default: a random free port. |
| `--app` | open an Edge app window (no tabs or address bar) instead of a browser tab. Windows only; falls back to the normal browser if Edge is not found. |
| `--no-open` | print the link but do not open the browser |
| `--version` | print the version |
| `--help` | usage |

It prints a link whose token works once, and opens it. The server listens on 127.0.0.1 only, accepts only
`localhost` and `127.0.0.1` as the host, and answers only to the browser that used the link.
It never writes to your tickets. Stop it with Ctrl+C (under `npx` on Windows the shell may ask "Terminate batch job (Y/N)?": answer Y).

A Windows shortcut for an app window: make a shortcut with the target
`cmd /c folio-issues-kanban-viewer --app --docs "<path>"`. (Folio does not create the shortcut itself.)

## Where it keeps files

It writes only its own settings and an index cache, never your docs.

| | Settings | Index cache |
|---|---|---|
| Windows | `%APPDATA%\Folio\settings.json` | `%LOCALAPPDATA%\Folio\cache` |
| macOS | `~/Library/Application Support/Folio/settings.json` | `~/Library/Caches/Folio/cache` |
| Linux | `$XDG_CONFIG_HOME/Folio/settings.json` (default `~/.config/Folio/settings.json`) | `$XDG_CACHE_HOME/Folio/cache` (default `~/.cache/Folio/cache`) |

Tested on Windows. macOS and Linux should work (the paths above are in the code) but are not tested yet.

## Uninstall

- Installed globally: `npm uninstall -g folio-issues-kanban-viewer`.
- Run with `npx`: nothing is installed. Its copy sits in the npm cache; `npm cache clean --force` removes it.
- To remove its data too, delete the settings file and the cache folder from the table above.

## Licences, security and releases

- The browser bundle includes third-party code. Its licence texts are in `dist/licenses/THIRD-PARTY-NOTICES.txt` in this package (the Geist font's licence is `dist/licenses/OFL-Geist.txt`).
- Report a security problem privately: [SECURITY.md](https://github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/blob/main/SECURITY.md).
- Release notes and the tarballs: [GitHub Releases](https://github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/releases).
- Source and issues: https://github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte
