import { createHash } from 'node:crypto'
import type { CheckResultId, EntityVersions } from '@durable-jev/contracts'

export const valueAtPath = (document: unknown, path: string): unknown => {
  return path.split('.').reduce<unknown>(readSegment, document)
}

const readSegment = (value: unknown, segment: string): unknown => {
  if (Array.isArray(value)) return value.map((element) => readSegment(element, segment))
  if (value !== null && typeof value === 'object') {
    return (value as Record<string, unknown>)[segment]
  }
  return undefined
}

export const computeInputFingerprint = (input: {
  document: unknown
  inputPaths: readonly string[]
  entityVersions: Partial<EntityVersions>
  upstreamResultIds: readonly CheckResultId[]
}): string => {
  const canonical = canonicalJson({
    inputs: input.inputPaths.map((path) => [path, valueAtPath(input.document, path) ?? null]),
    entityVersions: input.entityVersions,
    upstreamResultIds: [...input.upstreamResultIds].sort(),
  })
  return createHash('sha256').update(canonical).digest('hex')
}

const canonicalJson = (value: unknown): string => {
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

const entityByTrigger: Readonly<Record<string, readonly (keyof EntityVersions)[]>> = {
  cargo: ['cargo'],
  documents: ['cargo'],
  temperature: ['cargo'],
  inspection: ['cargo'],
  route: ['route'],
  vehicle: ['route'],
  reservation: ['route'],
  carrier: ['carrier'],
  quote: ['quote'],
  customer: ['quote'],
  loading: ['cargo', 'route', 'carrier', 'quote'],
}

export const relevantEntityVersions = (
  invalidationTriggers: readonly string[],
  entityVersions: EntityVersions,
): Partial<EntityVersions> => {
  const entities = new Set(
    invalidationTriggers.flatMap((trigger) => entityByTrigger[trigger] ?? []),
  )
  return Object.fromEntries(
    Object.entries(entityVersions).filter(([entity]) =>
      entities.has(entity as keyof EntityVersions),
    ),
  )
}
