import { describe, it, expect } from 'vitest'
import { nodeRadius, nodeCoreColor, linkColor } from './render'

describe('nodeRadius', () => {
  it('is a positive base at degree 0', () => {
    expect(nodeRadius(0, 'concept')).toBeGreaterThan(0)
    expect(nodeRadius(0, 'session')).toBeGreaterThan(0)
  })

  it('gives sessions a slightly larger base than concepts', () => {
    expect(nodeRadius(0, 'session')).toBeGreaterThan(nodeRadius(0, 'concept'))
  })

  it('is monotonically increasing in degree (sqrt growth)', () => {
    for (const type of ['concept', 'session'] as const) {
      for (let d = 0; d < 20; d++) {
        expect(nodeRadius(d + 1, type)).toBeGreaterThan(nodeRadius(d, type))
      }
    }
  })

  it('never returns NaN / non-finite for degree 0', () => {
    expect(Number.isFinite(nodeRadius(0, 'concept'))).toBe(true)
  })
})

describe('nodeCoreColor', () => {
  it('returns the exact node-core lime for concepts (regardless of bridge)', () => {
    expect(nodeCoreColor('concept', false)).toBe('#D8FF6A')
    expect(nodeCoreColor('concept', true)).toBe('#D8FF6A')
  })

  it('returns the exact session-red for sessions (regardless of bridge)', () => {
    expect(nodeCoreColor('session', false)).toBe('#C84E3A')
    expect(nodeCoreColor('session', true)).toBe('#C84E3A')
  })
})

describe('linkColor', () => {
  it('uses rule-blue base for structural relations', () => {
    expect(linkColor('cooccur')).toBe('#2F6F86')
    expect(linkColor('expands')).toBe('#2F6F86')
  })

  it('makes NEXT / CONTINUES stronger than the base (and equal to each other)', () => {
    expect(linkColor('next')).toBe(linkColor('continues'))
    expect(linkColor('next')).not.toBe(linkColor('cooccur'))
  })

  it('makes mentions dimmer (translucent)', () => {
    expect(linkColor('mentions').toLowerCase()).toContain('rgba')
  })
})
