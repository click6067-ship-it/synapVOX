import { describe, it, expect } from 'vitest'
import { normalizeLabel, computeCrossLinks } from './crossLinks'

describe('normalizeLabel', () => {
  it('trims, collapses whitespace, lowercases', () => {
    expect(normalizeLabel('  경사 하강법 ')).toBe('경사 하강법')
    expect(normalizeLabel('Gradient   Descent')).toBe('gradient descent')
  })
})

describe('computeCrossLinks', () => {
  it('links a concept shared across two projects', () => {
    const { links, crossIds } = computeCrossLinks([
      { id: 'a1', type: 'concept', label: '경사하강법', project: 'P-BIO' },
      { id: 'b1', type: 'concept', label: '경사하강법', project: 'P-ML' },
    ])
    expect(links).toEqual([{ source: 'a1', target: 'b1', relClass: 'cross' }])
    expect(crossIds).toEqual(new Set(['a1', 'b1']))
  })

  it('matches by normalized label (whitespace/case-insensitive)', () => {
    const { links } = computeCrossLinks([
      { id: 'a', type: 'concept', label: 'Gradient Descent', project: 'X' },
      { id: 'b', type: 'concept', label: 'gradient  descent', project: 'Y' },
    ])
    expect(links).toHaveLength(1)
  })

  it('does NOT link within the same project (only cross-project)', () => {
    const { links } = computeCrossLinks([
      { id: 'a', type: 'concept', label: '과적합', project: 'P-ML' },
      { id: 'b', type: 'concept', label: '과적합', project: 'P-ML' },
    ])
    expect(links).toHaveLength(0)
  })

  it('ignores sessions and hubs — only concepts bridge', () => {
    const { links } = computeCrossLinks([
      { id: 's1', type: 'session', label: '1단원', project: 'A' },
      { id: 's2', type: 'session', label: '1단원', project: 'B' },
      { id: 'm1', type: 'main', label: '딥러닝', project: 'A' },
    ])
    expect(links).toHaveLength(0)
  })

  it('connects all cross-project pairs when a concept spans 3 projects', () => {
    const { links, crossIds } = computeCrossLinks([
      { id: 'a', type: 'concept', label: '분류', project: 'A' },
      { id: 'b', type: 'concept', label: '분류', project: 'B' },
      { id: 'c', type: 'concept', label: '분류', project: 'C' },
    ])
    // 3 distinct projects → 3 unordered pairs (a-b, a-c, b-c).
    expect(links).toHaveLength(3)
    expect(crossIds).toEqual(new Set(['a', 'b', 'c']))
  })

  it('returns nothing for a single project', () => {
    const { links } = computeCrossLinks([
      { id: 'a', type: 'concept', label: '경사하강법', project: 'P-BIO' },
      { id: 'b', type: 'concept', label: '과적합', project: 'P-BIO' },
    ])
    expect(links).toHaveLength(0)
  })
})
