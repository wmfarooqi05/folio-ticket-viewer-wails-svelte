package mem

import (
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// Attach pauses m while the window is minimised or hidden. Wails v3 emits these events from
// the native WM_SIZE and WM_SHOWWINDOW messages, so no frontend code is involved.
func Attach(m *Monitor, win *application.WebviewWindow) {
	on := func(t events.WindowEventType, f func()) {
		win.OnWindowEvent(t, func(*application.WindowEvent) { f() })
	}
	on(events.Common.WindowMinimise, func() { m.SetMinimised(true) })
	on(events.Common.WindowUnMinimise, func() { m.SetMinimised(false) })
	on(events.Common.WindowHide, func() { m.SetHidden(true) })
	on(events.Common.WindowShow, func() { m.SetHidden(false) })
}
