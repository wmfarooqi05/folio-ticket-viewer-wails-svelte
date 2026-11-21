// Whether Folio is following the docs folder live, for the factory mirror's "Mirror live · updated
// 10:14" (ticket 41, ticket 37 Q2). The index store feeds it; the board header and the tree footer read it.

export const live = $state({
  /** the event stream is connected (web mode), or there is nothing to connect (the desktop app) */
  connected: false,
  /** unix ms of the last change set that changed or removed a file; null until one arrives */
  lastChange: null as number | null,
})

/** "10:14", the local time of a change. */
export const clock = (ms: number): string => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
