# folio-viewer

A read-only viewer for Markdown tickets. It starts a small web server on your own machine
and opens your browser. No exe, no dependencies: only Node 22 or newer.

```
npx folio-viewer --docs <path>
```

`<path>` is the repo root, or its docs folder (the one that holds `modules/`, `handoffs/`, `patterns/`).

Or install it once:

```
npm install -g folio-viewer
folio --docs <path>
```

| Option | |
|---|---|
| `--docs <path>` | the repo root or docs folder. Without it, the page asks for a path. |
| `--port <n>` | listen on this port. Default: a random free port. |
| `--app` | open an Edge app window (no tabs or address bar) instead of a browser tab. Windows only; falls back to the normal browser if Edge is not found. |
| `--no-open` | print the link but do not open the browser |
| `--help` | usage |

It prints a link whose token works once, and opens it. The server listens on 127.0.0.1 only, accepts only
`localhost` and `127.0.0.1` as the host, and answers only to the browser that used the link.
It never writes to your tickets. Stop it with Ctrl+C (under `npx` on Windows the shell may ask "Terminate batch job (Y/N)?": answer Y).

A Windows shortcut for an app window: make a shortcut with the target
`cmd /c folio --app --docs "<path>"`. (Folio does not create the shortcut itself.)

Settings and the index cache are stored where the retired Folio desktop app kept them
(`%APPDATA%\Folio\settings.json`, `%LOCALAPPDATA%\Folio\cache`).

Source and the desktop app: https://github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte
