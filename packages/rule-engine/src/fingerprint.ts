import { createHash } from 'node:crypto'
import type { CheckResultId, EntityVersions } from '@durable-jev/contracts'

export function valueAtPath(document: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(readSegment, document)
}

function readSegment(value: unknown, segment: string): unknown {
  if (Array.isArray(value)) return value.map((element) => readSegment(element, segment))
  if (value !== null && typeof value === 'object') {
    return (value as Record<string, unknown>)[segment]
  }
  return undefined
}

export function computeInputFingerprint(input: {
  document: unknown
  inputPaths: readonly string[]
  entityVersions: EntityVersions
  upstreamResultIds: readonly CheckResultId[]
}): string {
  const canonical = canonicalJson({
    inputs: input.inputPaths.map((path) => [path, valueAtPath(input.document, path) ?? null]),
    entityVersions: input.entityVersions,
    upstreamResultIds: [...input.upstreamResultIds].sort(),
  })
  return createHash('sha256').update(canonical).digest('hex')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}
