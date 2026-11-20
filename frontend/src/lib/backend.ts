// The one place that picks the backend. The default is the desktop (Wails) one. The web build
// (vite.web.config.ts) swaps this module for backend-http.ts, so @wailsio/runtime is not in
// the web bundle at all.
export { backend, isWeb } from './backend-wails'
