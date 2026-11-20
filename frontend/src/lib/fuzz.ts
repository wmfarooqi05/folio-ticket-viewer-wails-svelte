// Test helper (ticket 19): a seeded random generator for the fuzz and property tests. Plain vitest,
// no dependency. FOLIO_FUZZ_SEED picks the seed (a failure prints it) and FOLIO_FUZZ_N scales the runs.

export interface Rng {
  seed: number
  /** [0, 1) */
  next(): number
  int(n: number): number
  pick<T>(xs: readonly T[]): T
  /** n picks from xs, joined */
  string(xs: readonly string[], max: number): string
}

/** mulberry32 */
export function rng(seed: number): Rng {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (n: number) => Math.floor(next() * n)
  const pick = <T,>(xs: readonly T[]) => xs[int(xs.length)]
  return { seed, next, int, pick, string: (xs, max) => Array.from({ length: int(max + 1) }, () => pick(xs)).join('') }
}

export const SEED = Number(process.env.FOLIO_FUZZ_SEED ?? 19_2026)
/** runs per property: the default keeps `task test` quick; raise it for a longer campaign */
export const RUNS = Number(process.env.FOLIO_FUZZ_N ?? 400)

/** Runs `prop` RUNS times with one generator per run, and names the seed and run of a failure. */
export function forAll(name: string, prop: (r: Rng, i: number) => void, runs = RUNS): void {
  for (let i = 0; i < runs; i++) {
    const r = rng(SEED + i * 7919)
    try {
      prop(r, i)
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      err.message = `${name}: run ${i} (FOLIO_FUZZ_SEED=${SEED}, generator seed ${r.seed}): ${err.message}`
      throw err
    }
  }
}
