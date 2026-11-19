package shell

import (
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"

	"github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/settings"
)

// WindowOptions fills the window's size and position from the saved bounds. The
// position is used only when the saved rectangle is still on a connected screen
// (an unplugged monitor falls back to a centred default).
func WindowOptions(s *ShellService, o application.WebviewWindowOptions) application.WebviewWindowOptions {
	s.mu.Lock()
	w := s.saved.Window
	s.mu.Unlock()

	if w.Width > 0 && w.Height > 0 {
		o.Width, o.Height = w.Width, w.Height
	}
	if onAnyScreen(w) {
		o.InitialPosition = application.WindowXY
		o.X, o.Y = w.X, w.Y
	} else {
		o.InitialPosition = application.WindowCentered
	}
	if w.Maximised {
		o.StartState = application.WindowStateMaximised
	}
	return o
}

func onAnyScreen(w settings.Window) bool {
	if w.Width <= 0 || w.Height <= 0 {
		return false
	}
	cx, cy := w.X+w.Width/2, w.Y+w.Height/2
	for _, sc := range application.Get().Screen.GetAll() {
		b := sc.Bounds
		if cx >= b.X && cx < b.X+b.Width && cy >= b.Y && cy < b.Y+b.Height {
			return true
		}
	}
	return false
}

// RememberWindow saves the window bounds when the window closes. Only Go writes them.
func RememberWindow(s *ShellService, win *application.WebviewWindow) {
	win.RegisterHook(events.Common.WindowClosing, func(*application.WindowEvent) {
		maximised := win.IsMaximised()
		w := s.windowBounds()
		if !maximised { // keep the restored rectangle when closing maximised
			x, y := win.Position()
			width, height := win.Size()
			w.X, w.Y, w.Width, w.Height = x, y, width, height
		}
		w.Maximised = maximised
		s.saveWindow(w)
		log.Printf("shell: saved window bounds %+v", w)
	})
}

func (s *ShellService) saveWindow(w settings.Window) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.saved.Window = w
	if err := settings.Save(s.path, s.saved); err != nil {
		log.Printf("shell: saving window bounds: %v", err)
	}
}

func (s *ShellService) windowBounds() settings.Window {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saved.Window
}
