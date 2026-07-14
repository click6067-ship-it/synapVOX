import { describe, it, expect } from 'vitest'
import { slugify } from './slug'

describe('slugify', () => {
  it('lowercases and collapses non [A-Za-z0-9_-] runs to a single dash', () => {
    expect(slugify('Deep Learning 101', 1)).toBe('deep-learning-101-1')
  })

  it('falls back to "graph" when the title has no latin/digit/dash chars (e.g. Korean)', () => {
    expect(slugify('딥러닝 강의', 1)).toBe('graph-1')
  })

  it('falls back to "graph" for an empty title', () => {
    expect(slugify('', 1)).toBe('graph-1')
  })

  it('strips leading/trailing dashes left over from stripped punctuation', () => {
    expect(slugify('--!! hi !!--', 1)).toBe('hi-1')
  })

  it('always matches the backend group_id charset', () => {
    const s = slugify('한글 Title_with-Mixed 문자!! @@', Date.now())
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('stays within the backend 64-char limit even for a long title', () => {
    const long = 'a'.repeat(200)
    const s = slugify(long, Date.now())
    expect(s.length).toBeLessThanOrEqual(64)
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('produces distinct slugs for the same title submitted at different times', () => {
    expect(slugify('same title', 1)).not.toBe(slugify('same title', 2))
  })
})
