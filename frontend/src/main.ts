import './app.css'
import { mount } from 'svelte'
import App from './App.svelte'
import { getConfig } from './lib/api'
import { applyTheme } from './lib/theme/theme'

// Read the saved theme before mounting, so the first paint is in the right theme.
const initial = await getConfig().catch((err: unknown) => {
  console.error('GetConfig failed', err)
  return null
})
if (initial) applyTheme(initial.theme)

export default mount(App, { target: document.getElementById('app')!, props: { initial } })
