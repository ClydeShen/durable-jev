interface Reading {
  at: string
  deciCelsius: number
}

interface TargetRange {
  minDeciCelsius: number
  maxDeciCelsius: number
}

const minutesBetween = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 60_000

export function longestExcursionMinutes(readings: readonly Reading[], range: TargetRange): number {
  const ordered = [...readings].sort((left, right) => left.at.localeCompare(right.at))
  let longest = 0
  let excursionStart: string | undefined
  for (const reading of ordered) {
    const outside =
      reading.deciCelsius < range.minDeciCelsius || reading.deciCelsius > range.maxDeciCelsius
    if (outside && excursionStart === undefined) excursionStart = reading.at
    if (!outside && excursionStart !== undefined) {
      longest = Math.max(longest, minutesBetween(excursionStart, reading.at))
      excursionStart = undefined
    }
  }
  const last = ordered.at(-1)
  if (excursionStart !== undefined && last)
    longest = Math.max(longest, minutesBetween(excursionStart, last.at))
  return longest
}
