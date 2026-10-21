import { describe, expect, it } from 'vitest'
import { longestExcursionMinutes } from './temperature-log.js'

const range = { minDeciCelsius: 20, maxDeciCelsius: 80 }
const at = (minute: number) => new Date(Date.UTC(2026, 10, 1, 8, minute)).toISOString()

describe('longestExcursionMinutes', () => {
  it('measures the longest continuous time outside the target range', () => {
    const readings = [50, 85, 90, 60, 82, 84, 86, 88, 70].map((deciCelsius, index) => ({
      at: at(index * 5),
      deciCelsius,
    }))
    expect(longestExcursionMinutes(readings, range)).toBe(20)
  })

  it('counts an excursion still open at the last reading', () => {
    const readings = [50, 90, 95].map((deciCelsius, index) => ({ at: at(index * 10), deciCelsius }))
    expect(longestExcursionMinutes(readings, range)).toBe(10)
  })
})
