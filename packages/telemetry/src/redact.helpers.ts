const secretKey = /authorization|api[-_]?key|secret|token|password|cookie|credential/i
const maxStringLength = 400
const maxDepth = 6

// Keeps secrets and whole documents out of the observation store: values under secret-looking
// keys are replaced, and long text is cut (a hash of the input is the right way to refer to it).
export const redact = (value: unknown, depth = 0): unknown => {
  if (typeof value === 'string') {
    return value.length > maxStringLength
      ? `${value.slice(0, maxStringLength)}[truncated ${value.length - maxStringLength} chars]`
      : value
  }
  if (value === null || typeof value !== 'object') return value
  if (depth >= maxDepth) return '[too deep]'
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1))
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      key,
      secretKey.test(key) ? '[redacted]' : redact(inner, depth + 1),
    ]),
  )
}

export const redactHeaders = (headers: Record<string, unknown>): Record<string, unknown> => {
  return redact(headers) as Record<string, unknown>
}
