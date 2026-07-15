import { describe, it, expect } from 'vitest'
import { projectLabel } from './projectMeta'

describe('projectLabel', () => {
  it('maps P-BIO to its topic name 딥러닝', () => {
    expect(projectLabel('P-BIO')).toBe('딥러닝')
  })

  it('maps P-ML to its topic name 머신러닝', () => {
    expect(projectLabel('P-ML')).toBe('머신러닝')
  })

  it('maps P-LIFE to its topic name 생명과학', () => {
    expect(projectLabel('P-LIFE')).toBe('생명과학')
  })

  it('falls back to the id itself for an unknown project', () => {
    expect(projectLabel('graph-x')).toBe('graph-x')
  })
})
