import { describe, expect, it } from 'vitest'
import { DEFAULT_WIDTH, MAX_WIDTH, MIN_WIDTH, STEP, clampWidth, dragWidth, keyWidth, maxWidth } from './resize'

describe('clampWidth', () => {
  it('limits to the range and rounds', () => {
    expect(clampWidth(100)).toBe(MIN_WIDTH)
    expect(clampWidth(900)).toBe(MAX_WIDTH)
    expect(clampWidth(300.6)).toBe(301)
  })
  it('falls back to the default for unset or bad values', () => {
    expect(clampWidth(0)).toBe(DEFAULT_WIDTH)
    expect(clampWidth(NaN)).toBe(DEFAULT_WIDTH)
    expect(clampWidth(-5)).toBe(DEFAULT_WIDTH)
  })
  it('respects a smaller max but never goes below the minimum', () => {
    expect(clampWidth(400, 320)).toBe(320)
    expect(clampWidth(400, 100)).toBe(MIN_WIDTH)
    expect(clampWidth(0, 250)).toBe(250)
  })
})

describe('maxWidth', () => {
  it('is 480 on a wide window', () => expect(maxWidth(1600, false)).toBe(MAX_WIDTH))
  it('keeps the middle pane at 480 or more', () => {
    expect(maxWidth(1000, false)).toBe(480)
    expect(maxWidth(900, false)).toBe(420)
  })
  it('accounts for the open side panel', () => {
    expect(maxWidth(1300, true)).toBe(460)
    expect(maxWidth(1200, true)).toBe(360)
  })
  it('never drops below the minimum', () => expect(maxWidth(600, true)).toBe(MIN_WIDTH))
})

describe('keyWidth', () => {
  it('steps by 16', () => {
    expect(keyWidth('ArrowRight', 280)).toBe(280 + STEP)
    expect(keyWidth('ArrowLeft', 280)).toBe(280 - STEP)
  })
  it('stops at the limits', () => {
    expect(keyWidth('ArrowLeft', 205)).toBe(MIN_WIDTH)
    expect(keyWidth('ArrowRight', 475)).toBe(MAX_WIDTH)
    expect(keyWidth('ArrowRight', 350, 360)).toBe(360)
  })
  it('Home and End go to the min and the current max', () => {
    expect(keyWidth('Home', 300)).toBe(MIN_WIDTH)
    expect(keyWidth('End', 300)).toBe(MAX_WIDTH)
    expect(keyWidth('End', 300, 400)).toBe(400)
  })
  it('ignores other keys', () => expect(keyWidth('a', 300)).toBeNull())
})

describe('dragWidth', () => {
  it('is the pointer offset from the tree edge, clamped', () => {
    expect(dragWidth(350, 0)).toBe(350)
    expect(dragWidth(50, 0)).toBe(MIN_WIDTH)
    expect(dragWidth(2000, 0)).toBe(MAX_WIDTH)
    expect(dragWidth(450, 100, 400)).toBe(350)
  })
})
