export const percentile = (values: readonly number[], fraction: number): number => {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)
  return sorted[Math.max(0, index)] ?? Number.NaN
}

export const summarise = (values: readonly number[]) => ({
  n: values.length,
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  mean: values.reduce((sum, value) => sum + value, 0) / (values.length || 1),
})

export type Summary = ReturnType<typeof summarise>

export const milliseconds = (value: number) => `${value.toFixed(2)} ms`
