package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func init() {
	application.RegisterEvent[string]("file:changed")
}

func main() {
	app := application.New(application.Options{
		Name:     "shell",
		Services: []application.Service{application.NewService(&FileService{})},
		Assets:   application.AssetOptions{Handler: application.AssetFileServerFS(assets)},
	})
	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "Ticket shell prototype",
		Width:  900,
		Height: 650,
		URL:    "/",
	})
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
