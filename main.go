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
		Assets: application.AssetOptions{Handler: application.AssetFileServerFS(assets)},
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
