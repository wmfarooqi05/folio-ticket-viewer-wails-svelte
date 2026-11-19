// Folio is a read-only desktop viewer of file-based tickets. See README.md.
package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/docs"
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

	app = application.New(application.Options{
		Name:        "Folio",
		Description: "Read-only viewer of file-based tickets",
		Services: []application.Service{
			application.NewService(docsSvc),
			application.NewService(shellSvc),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
			// /doc/<path> serves images from the docs folder (ticket 10, 06 D6).
			Middleware: shell.DocAssets(func() string { return shell.RootsOf(shellSvc).Docs }),
		},
		// WebView2 tuning from ticket 07 (docs/assets/07-findings.md). GPU off is the real
		// win: about -75 MB private at idle with no CPU cost. The rest is housekeeping.
		// Extra disabled features must go in DisabledFeatures: Wails emits its own
		// --disable-features, and a second one in AdditionalBrowserArgs would override it.
		Windows: application.WindowsOptions{
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

	win := app.Window.NewWithOptions(shell.WindowOptions(shellSvc, application.WebviewWindowOptions{
		Title:     "Folio",
		Width:     1440,
		Height:    900,
		MinWidth:  900,
		MinHeight: 560,
		URL:       "/",
	}))
	shell.RememberWindow(shellSvc, win)

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
