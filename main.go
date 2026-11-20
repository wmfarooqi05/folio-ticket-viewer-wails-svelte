// Folio is a read-only desktop viewer of file-based tickets. See README.md.
package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/docs"
	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/localdata"
	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/mem"
	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/paths"
	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/settings"
	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/shell"
)

//go:embed all:frontend/dist
var assets embed.FS

func init() {
	// Typed event helpers are generated into the frontend bindings.
	application.RegisterEvent[docs.ChangeSet](docs.ChangedEvent)
}

func main() {
	log.SetFlags(log.LstdFlags | log.Lmicroseconds) // the cache timings are read from this log
	// "Clear data" (L5) leaves a request to delete the WebView2 profile. It has to run before the
	// first window exists, because a running WebView2 locks its profile folder.
	if _, err := localdata.Default().RunPending(); err != nil {
		log.Printf("folio: clear data: %v", err)
	}
	path, err := settings.Path()
	if err != nil {
		log.Fatalf("folio: settings path: %v", err)
	}
	shellSvc := shell.New(path)

	var app *application.App
	docsSvc := docs.NewService(
		func() docs.Roots { return shell.RootsOf(shellSvc) },
		func(cs docs.ChangeSet) { app.Event.Emit(docs.ChangedEvent, cs) },
	)

	// The RAM readout (ticket 16): idle until the frontend turns it on from the showMemory setting.
	benchLog := shell.BenchMemLog() // bench builds only: lets ram-check.ps1 compare the readout with its own number
	memMon := mem.NewMonitor(func(b uint64) {
		if benchLog {
			log.Printf("folio.mem: bytes=%d", b)
		}
		app.Event.Emit(mem.Event, b)
	})

	profile, err := paths.WebView2Dir() // %LOCALAPPDATA%\Folio\WebView2, not the roaming %APPDATA% (ticket 16, M2)
	if err != nil {
		log.Fatalf("folio: webview2 profile path: %v", err)
	}
	// Only Folio's own origin may call the Wails runtime, and the watchdog trusts only it.
	origin := appOrigin()

	// The navigation watchdog (ticket 16): Go asks the browser where the window is and resets it unless
	// it is Folio's page. win is set below; the closures only run once the window exists.
	var win *application.WebviewWindow
	watchdog := shell.NewWatchdog(origin,
		func(js string) { win.ExecJS(js) },
		func() { win.SetURL("/") })

	app = application.New(application.Options{
		RawMessageHandler: shell.RawHandler(func() *shell.Watchdog { return watchdog }),
		Name:              "Folio",
		Description:       "Read-only viewer of file-based tickets",
		Services: []application.Service{
			application.NewService(docsSvc),
			application.NewService(shellSvc),
			application.NewService(mem.NewMemoryService(memMon)),
			application.NewService(localdata.NewLocalDataService(docsSvc)),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
			// /doc/<path> serves images from the docs folder (ticket 10, 06 D6).
			// The runtime guard is outermost, so it sees every request before Wails' own transport (ticket 16).
			Middleware: shell.Chain(
				shell.FrameGuard,
				shell.RuntimeGuard(origin),
				shell.DocAssets(func() string { return shell.RootsOf(shellSvc).Docs }),
			),
		},
		// WebView2 tuning from ticket 07 (docs/assets/07-findings.md). GPU off is the real
		// win: about -75 MB private at idle with no CPU cost. The rest is housekeeping.
		// Extra disabled features must go in DisabledFeatures: Wails emits its own
		// --disable-features, and a second one in AdditionalBrowserArgs would override it.
		Windows: application.WindowsOptions{
			WebviewUserDataPath: profile,
			DisabledFeatures: []string{
				"SpareRendererForSitePerProcess", "Translate", "TranslateUI",
				"OptimizationHints", "OptimizationGuideModelDownloading", "MediaRouter",
				"AutofillServerCommunication", "msEdgeShopping", "msEdgeSidebar",
			},
			AdditionalBrowserArgs: []string{
				"--disable-gpu", "--disable-gpu-compositing",
				"--disable-spell-checking", "--disable-component-update",
				"--disable-background-networking", "--disable-sync", "--no-pings",
				"--disable-breakpad",
			},
		},
	})

	win = app.Window.NewWithOptions(shell.Harden(shell.WindowOptions(shellSvc, application.WebviewWindowOptions{
		Title:     "Folio",
		Width:     1440,
		Height:    900,
		MinWidth:  900,
		MinHeight: 560,
		URL:       "/",
	})))
	shell.WatchNavigation(win, watchdog)
	shell.RememberWindow(shellSvc, win)
	mem.Attach(memMon, win) // paused while the window is minimised or hidden
	// RAM bench hook (ticket 15): compiled in only with -tags bench, and then off unless FOLIO_BENCH=1
	// and FOLIO_BENCH_DIR are set.
	shell.StartBench(func(event, path string) { app.Event.Emit(event, path) })

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
