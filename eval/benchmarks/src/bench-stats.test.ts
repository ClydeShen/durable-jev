import { describe, expect, it } from 'vitest'
import { percentile, summarise } from './bench-stats.helpers.js'

describe('benchmark statistics', () => {
  it('reads percentiles from the sorted values', () => {
    const values = Array.from({ length: 100 }, (_, index) => index + 1)
    expect(percentile(values, 0.5)).toBe(50)
    expect(percentile(values, 0.95)).toBe(95)
    expect(summarise([4, 2, 6]).mean).toBe(4)
  })

  it('does not invent a number for no data', () => {
    expect(percentile([], 0.5)).toBeNaN()
  })
})
