# folio-issues-kanban-viewer

[![npm](https://img.shields.io/npm/v/folio-issues-kanban-viewer)](https://www.npmjs.com/package/folio-issues-kanban-viewer) [![license](https://img.shields.io/npm/l/folio-issues-kanban-viewer)](https://github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/blob/main/LICENSE) [![node](https://img.shields.io/node/v/folio-issues-kanban-viewer)](https://nodejs.org) [![ci](https://img.shields.io/github/actions/workflow/status/wmfarooqi05/folio-ticket-viewer-wails-svelte/ci.yml?branch=main&label=ci)](https://github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/actions/workflows/ci.yml) ![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen) ![size](https://img.shields.io/npm/unpacked-size/folio-issues-kanban-viewer) [![Socket](https://socket.dev/api/badge/npm/package/folio-issues-kanban-viewer)](https://socket.dev/npm/package/folio-issues-kanban-viewer) [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/badge)](https://scorecard.dev/viewer/?uri=github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte) [![OpenSSF Best Practices](https://www.bestpractices.dev/projects/16975/badge)](https://www.bestpractices.dev/projects/16975)

A read-only viewer for Markdown tickets. It starts a small web server on your own machine
and opens your browser. No exe, no dependencies: only Node 22 or newer.

```
npx folio-issues-kanban-viewer --docs <path>
```

It downloads about 1.3 MB (4.4 MB unpacked). Most of that is Mermaid, KaTeX and highlight.js, for diagrams, maths and code, and the browser loads each only when a document needs it.

`<path>` is any local folder. Known layouts come first: a repo root, or its docs folder with `modules/`, `handoffs/` or `patterns/`, or a `map.md` with an `issues/` folder of numbered tickets, shown as a list and a kanban board. Otherwise Folio reads `docs/` if it has Markdown, else the folder itself. A drive root is refused.

Or install it once:

```
npm install -g folio-issues-kanban-viewer
folio-issues-kanban-viewer <path>      # or the short name: folio <path>
folio .                                # this folder
```

(`folio-issues-kanban-viewer` is the safe name: another npm package called `folio` also installs a `folio` command, and
two global installs would clash.)

| Option | |
|---|---|
| `<path>` or `--docs <path>` | the repo root or docs folder, given once. `folio .` is this folder. Without it, the page asks for a path. |
| `--evidence <folder>` | the folder agents stage evidence in (screenshots, videos). A ticket's evidence is shown only from inside it. For this run only; Settings can save one, and so can a ticket's evidence panel (Allow). |
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

- Folio is MIT licensed (`LICENSE`).
- The browser bundle includes third-party code. Its licence texts are in `dist/licenses/THIRD-PARTY-NOTICES.txt` in this package (the Geist font's licence is `dist/licenses/OFL-Geist.txt`).
- Report a security problem privately: [SECURITY.md](https://github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/blob/main/SECURITY.md).
- What changed in each release: [CHANGELOG.md](https://github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/blob/main/CHANGELOG.md). The tarballs, checksums and provenance: [GitHub Releases](https://github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/releases).
- Report a bug or ask for a feature: [issues](https://github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/issues). To contribute: [CONTRIBUTING.md](https://github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/blob/main/CONTRIBUTING.md).
- Source: https://github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte
