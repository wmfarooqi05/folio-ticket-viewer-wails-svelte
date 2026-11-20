// Mermaid diagrams (ticket 14; 06 D3). Mermaid 12.3.0 is loaded with import() the first time a
// document has a mermaid fence, so none of it is in the initial chunk.
//
//   securityLevel 'strict'  Mermaid's own DOMPurify cleans labels and drops click handlers
//   our own pass            the SVG is parsed in an inert document and stripped again (sanitizeSvg),
//                           because the string is going into the page with innerHTML
//   theme                   'base' with themeVariables read from the CSS tokens, re-run on a theme toggle
//   cache                   sanitised SVG per (path, mtime, block, theme), a handful of entries
//   error                   the fence's source stays and a line says what failed

import './mermaid.css'

export type ThemeName = 'light' | 'dark'

export interface Block {
  /** the placeholder `.code[data-mermaid]` */
  el: HTMLElement
  src: string
  /** index of the block in the document */
  n: number
}

export interface RenderContext {
  path: string
  mtime: number
  theme: ThemeName
  /** false once the document was replaced or the view closed: nothing more is written */
  alive: () => boolean
}

// ---- sanitising ----------------------------------------------------------------

const DROP = new Set([
  'script',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'link',
  'meta',
  'base',
  'img',
  'image',
  'audio',
  'video',
  'source',
  'animate',
  'set',
])
/** The data attributes the document layer routes on (dom.ts, enhance.ts): a label must not carry them. */
const DOC_DATA = new Set(['ext', 'path', 'frag', 'broken', 'copy', 'keep', 'anchor', 'mermaid', 'line'])
const URL_ATTRS = new Set(['href', 'xlink:href', 'src', 'action', 'formaction', 'data', 'poster', 'background'])

/** `url(` that does not point at a fragment of this document */
const EXTERNAL_URL = /url\(\s*(?!['"]?#)/i

export function cleanStyleText(css: string): string {
  return css.replace(/@import[^;]*;?/gi, '').replace(/url\(\s*(?!['"]?#)[^)]*\)/gi, 'none')
}

function cleanElement(el: Element): void {
  for (const a of [...el.attributes]) {
    const name = a.name.toLowerCase()
    const value = a.value
    if (name.startsWith('on')) el.removeAttribute(a.name)
    else if (name.startsWith('data-') && DOC_DATA.has(name.slice(5))) el.removeAttribute(a.name)
    else if (URL_ATTRS.has(name) && !value.trim().startsWith('#')) el.removeAttribute(a.name)
    else if (name === 'style' && (EXTERNAL_URL.test(value) || /expression\(|javascript:|@import/i.test(value))) el.removeAttribute(a.name)
    else if (name === 'srcdoc') el.removeAttribute(a.name)
  }
}

/**
 * The SVG string Mermaid returned, parsed in an inert document and cleaned: no script, no
 * frames, no event handler attribute, no link that leaves the document, no external url().
 * Returns the cleaned `<svg>` markup, or null when there is no svg element in it.
 * Labels keep their `foreignObject` (flowchart text is HTML), minus anything above.
 */
export function sanitizeSvg(svg: string): string | null {
  const doc = new DOMParser().parseFromString(svg, 'text/html')
  const root = doc.body.querySelector('svg')
  if (!root) return null
  const all = [root, ...root.querySelectorAll('*')]
  for (const el of all) {
    if (DROP.has(el.localName.toLowerCase())) {
      el.remove()
      continue
    }
    cleanElement(el)
    if (el.localName.toLowerCase() === 'style') el.textContent = cleanStyleText(el.textContent ?? '')
  }
  return root.outerHTML
}

// ---- cache ---------------------------------------------------------------------

/** Two panes, a few diagrams each (06 section 3): small on purpose, RAM comes first. */
const CACHE_MAX = 8
const cache = new Map<string, string>()

export const cacheKey = (path: string, mtime: number, n: number, theme: ThemeName): string =>
  `${path}|${mtime}|${n}|${theme}`

function cacheGet(k: string): string | undefined {
  const v = cache.get(k)
  if (v !== undefined) {
    cache.delete(k)
    cache.set(k, v)
  }
  return v
}

function cacheSet(k: string, v: string): void {
  cache.delete(k)
  cache.set(k, v)
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!)
}

export const cacheSize = (): number => cache.size
export const clearCache = (): void => cache.clear()

// ---- theme ---------------------------------------------------------------------

/**
 * A CSS colour (hex, rgba, oklch) as #rrggbb, composited over `over`. Mermaid's colour maths
 * does not read oklch, so every token goes through the canvas, which does.
 */
function toHex(value: string, over: string): string {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!ctx) return value
  ctx.fillStyle = over
  ctx.fillRect(0, 0, 1, 1)
  ctx.fillStyle = value
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')
}

/** Mermaid `themeVariables` from the CSS tokens of the document that is showing right now. */
export function themeVariables(): Record<string, string> {
  const cs = getComputedStyle(document.documentElement)
  const tok = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback
  const bg = toHex(tok('--code', '#f5f5f2'), '#ffffff')
  const c = (name: string, fallback: string) => toHex(tok(name, fallback), bg)
  const fg = c('--fg', '#1c1c1a')
  const fg2 = c('--fg2', '#585850')
  const fg3 = c('--fg3', '#8b8b83')
  const acc = c('--acc', '#4f46e5')
  const card = c('--card', '#ffffff')
  const line = c('--line2', '#d0d0cc')
  const chip = c('--chip', '#eeeeea')
  return {
    background: bg,
    fontFamily: "'Geist', system-ui, sans-serif",
    fontSize: '13px',
    primaryColor: card,
    primaryTextColor: fg,
    primaryBorderColor: acc,
    secondaryColor: chip,
    secondaryTextColor: fg,
    secondaryBorderColor: line,
    tertiaryColor: bg,
    tertiaryTextColor: fg,
    tertiaryBorderColor: line,
    mainBkg: card,
    nodeBorder: acc,
    nodeTextColor: fg,
    lineColor: fg3,
    textColor: fg,
    titleColor: fg,
    clusterBkg: bg,
    clusterBorder: line,
    edgeLabelBackground: bg,
    noteBkgColor: chip,
    noteTextColor: fg,
    noteBorderColor: line,
    actorBkg: card,
    actorBorder: acc,
    actorTextColor: fg,
    actorLineColor: fg3,
    signalColor: fg2,
    signalTextColor: fg,
    labelBoxBkgColor: card,
    labelBoxBorderColor: line,
    labelTextColor: fg,
    loopTextColor: fg2,
    activationBkgColor: chip,
    activationBorderColor: acc,
    sequenceNumberColor: card,
  }
}

// ---- rendering -----------------------------------------------------------------

type Mermaid = (typeof import('mermaid'))['default']
let loaded: Promise<Mermaid> | null = null
/**
 * Config keys a document's `%%{init: ...}%%` directive or frontmatter can never change. The app sets
 * them itself. themeCSS is raw CSS, so a directive could restyle the whole page; the others
 * change the look or the HTML labels.
 */
export const SECURE_KEYS = [
  'secure',
  'securityLevel',
  'startOnLoad',
  'maxTextSize',
  'suppressErrorRendering',
  'maxEdges',
  'layout',
  'dompurifyConfig',
  'themeCSS',
  'themeVariables',
  'fontFamily',
  'htmlLabels',
] as const

let configuredFor: string | null = null
let seq = 0
let inserts = 0
/** one render at a time: Mermaid parks a scratch element in <body> per call */
let queue: Promise<unknown> = Promise.resolve()

function load(): Promise<Mermaid> {
  loaded ??= import('mermaid').then((m) => m.default)
  return loaded
}

function configure(mermaid: Mermaid, theme: ThemeName): void {
  // the same theme name can mean new token values (an accent change), so key on the values
  const vars = themeVariables()
  const key = theme + JSON.stringify(vars)
  if (configuredFor === key) return
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    themeVariables: vars,
    fontFamily: vars.fontFamily,
    suppressErrorRendering: true,
    logLevel: 'fatal',
    // dagre only: ELK is not bundled (vite.config.ts), and a directive or frontmatter in a
    // document must not be able to switch the layout, the security level or the limits
    layout: 'dagre',
    secure: [...SECURE_KEYS],
  })
  configuredFor = key
}

/** `flowchart-elk` is the ELK flowchart; it is drawn with dagre like every other flowchart. */
export const noElk = (src: string): string => src.replace(/^(\s*)flowchart-elk\b/m, '$1flowchart')

/** The placeholder shows the diagram's source: the fallback and the error state. */
export function showSource(el: HTMLElement, src: string, error: string | null): void {
  el.querySelector('.mermaid-out')?.remove()
  el.querySelector('.mermaid-err')?.remove()
  let pre = el.querySelector('pre')
  if (!pre) {
    pre = document.createElement('pre')
    pre.append(document.createElement('code'))
    el.append(pre)
  }
  pre.querySelector('code')!.textContent = src
  el.dataset.state = error ? 'error' : 'source'
  if (error) {
    const p = document.createElement('p')
    p.className = 'mermaid-err'
    p.setAttribute('role', 'alert')
    p.textContent = `This diagram could not be drawn: ${error}`
    el.querySelector('.code-head')?.after(p)
  }
}

export function showSvg(el: HTMLElement, svg: string): void {
  el.querySelector('.mermaid-err')?.remove()
  el.querySelector('pre')?.remove()
  let out = el.querySelector<HTMLElement>('.mermaid-out')
  if (!out) {
    out = document.createElement('div')
    out.className = 'mermaid-out'
    el.append(out)
  }
  // The cached string is shown in more than one place (the middle pane and the panel), so its
  // id, and every reference to it, gets a suffix that is new for each insert.
  const base = /<svg[^>]*\sid="([^"]+)"/.exec(svg)?.[1]
  out.innerHTML = base ? svg.replaceAll(base, `${base}-${++inserts}`) : svg // sanitizeSvg output, serialised
  el.dataset.state = 'ready'
}

function oneLine(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  return m.split('\n').find((l) => l.trim() !== '')?.trim() ?? 'unknown error'
}

/** Renders the blocks in order. A block that fails keeps its source and says why. */
export function renderBlocks(blocks: Block[], ctx: RenderContext): Promise<void> {
  const run = async () => {
    // cached ones first: they need no library at all
    const todo: Block[] = []
    for (const b of blocks) {
      const hit = cacheGet(cacheKey(ctx.path, ctx.mtime, b.n, ctx.theme))
      if (hit !== undefined) {
        if (ctx.alive()) showSvg(b.el, hit)
      } else todo.push(b)
    }
    if (todo.length === 0 || !ctx.alive()) return
    let mermaid: Mermaid
    try {
      mermaid = await load()
    } catch (e) {
      loaded = null
      for (const b of todo) if (ctx.alive()) showSource(b.el, b.src, `Mermaid did not load (${oneLine(e)})`)
      return
    }
    for (const b of todo) {
      if (!ctx.alive()) return
      const id = `folio-mmd-${++seq}`
      let svg: string
      try {
        configure(mermaid, ctx.theme)
        svg = (await mermaid.render(id, noElk(b.src))).svg
      } catch (e) {
        if (ctx.alive()) showSource(b.el, b.src, oneLine(e))
        continue
      } finally {
        // Mermaid parks a scratch element in <body> and leaves it behind when a render throws.
        // Gone before the SVG goes in: the SVG carries the same id.
        document.getElementById(id)?.remove()
        document.getElementById('d' + id)?.remove()
      }
      const clean = sanitizeSvg(svg)
      if (clean === null) {
        if (ctx.alive()) showSource(b.el, b.src, 'no diagram came back')
        continue
      }
      cacheSet(cacheKey(ctx.path, ctx.mtime, b.n, ctx.theme), clean)
      if (ctx.alive()) showSvg(b.el, clean)
    }
  }
  const next = queue.then(run, run)
  queue = next.catch(() => {})
  return next
}
