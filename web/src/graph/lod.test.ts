import { describe, it, expect } from 'vitest'
import { labelOpacity, LOW_SCALE, HIGH_SCALE } from './lod'

const MAX = 20

describe('labelOpacity', () => {
  it('hovered/selected node label is always fully shown, regardless of zoom', () => {
    expect(labelOpacity(0.1, 0, MAX, true)).toBe(1) // zoomed way out, leaf
    expect(labelOpacity(5, MAX, MAX, true)).toBe(1) // zoomed in, hub
    expect(labelOpacity(LOW_SCALE, 1, MAX, true)).toBe(1)
  })

  it('at low zoom, a low-degree node is hidden (0)', () => {
    expect(labelOpacity(0.3, 1, MAX, false)).toBe(0)
    // even just below LOW_SCALE, a leaf is still 0
    expect(labelOpacity(LOW_SCALE - 0.1, 1, MAX, false)).toBe(0)
  })

  it('at low zoom, a top-degree hub is still visible (>0)', () => {
    expect(labelOpacity(0.3, MAX, MAX, false)).toBeGreaterThan(0)
  })

  it('at high zoom, any node label has faded fully in (~1)', () => {
    expect(labelOpacity(HIGH_SCALE, 1, MAX, false)).toBeCloseTo(1)
    expect(labelOpacity(3, 1, MAX, false)).toBeCloseTo(1)
    expect(labelOpacity(3, MAX, MAX, false)).toBeCloseTo(1)
  })

  it('is monotonically non-decreasing as you zoom in (fixed node)', () => {
    let prev = -1
    for (let s = 0; s <= 5.0001; s += 0.2) {
      const o = labelOpacity(s, 5, MAX, false)
      expect(o).toBeGreaterThanOrEqual(prev)
      prev = o
    }
  })

  it('a bigger hub is at least as visible as a smaller node at the same zoom', () => {
    const s = 0.9
    expect(labelOpacity(s, MAX, MAX, false)).toBeGreaterThanOrEqual(
      labelOpacity(s, 2, MAX, false),
    )
  })

  it('output is always clamped to [0,1]', () => {
    for (const s of [-3, 0, 0.5, 1, 2, 10]) {
      for (const d of [0, 1, 10, 20, 100]) {
        const o = labelOpacity(s, d, MAX, false)
        expect(o).toBeGreaterThanOrEqual(0)
        expect(o).toBeLessThanOrEqual(1)
      }
    }
  })

  it('handles maxDegree=0 without NaN', () => {
    const o = labelOpacity(2, 5, 0, false)
    expect(Number.isFinite(o)).toBe(true)
    expect(o).toBeGreaterThanOrEqual(0)
    expect(o).toBeLessThanOrEqual(1)
  })

  it('non-finite globalScale → 0 (safe)', () => {
    expect(labelOpacity(NaN, 5, MAX, false)).toBe(0)
    expect(labelOpacity(Infinity, 5, MAX, false)).toBe(1) // fully zoomed ⇒ full
  })
})
