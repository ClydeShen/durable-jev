import type { CheckScope } from '@durable-jev/contracts'
import type { SelectionProfile } from './rule-selection.js'

/** Readable business data supplied by a domain. */
export type Facts = Record<string, unknown>

interface ScopedFacts {
  scope: CheckScope
  facts: Facts
  context?: Facts
}

/** Everything rules can read about a case, plus the entity versions that drive invalidation. */
export interface CaseFacts {
  entityVersions: Record<string, number | string>
  root: ScopedFacts
  collections: Readonly<Record<string, readonly ScopedFacts[]>>
  context: Facts
  selection?: SelectionProfile
}

export function scopeKey(scope: CheckScope): string {
  if (scope.kind === 'cargoItem') return `cargoItem:${scope.cargoItemId}`
  if (scope.kind === 'leg') return `leg:${scope.legId}`
  return 'entityId' in scope && scope.entityId
    ? `${scope.kind}:${encodeURIComponent(scope.entityId)}`
    : scope.kind
}

export function scopeMembers(facts: CaseFacts, kind: string): CheckScope[] {
  if (kind === facts.root.scope.kind) return [facts.root.scope]
  return (facts.collections[kind] ?? []).map((member) => member.scope)
}

export function factsInScope(facts: CaseFacts, scope: CheckScope): ScopedFacts | undefined {
  if (scopeKey(scope) === scopeKey(facts.root.scope)) return facts.root
  return facts.collections[scope.kind]?.find((member) => scopeKey(member.scope) === scopeKey(scope))
}

export function factValue(source: Facts, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (Array.isArray(value)) return value.map((element) => (element as Facts | undefined)?.[key])
    return value !== null && typeof value === 'object' ? (value as Facts)[key] : undefined
  }, source)
}

export function assertFactScopes(facts: CaseFacts, rootScope: string): void {
  if (facts.root.scope.kind !== rootScope)
    throw new Error(`expected root scope ${rootScope}, received ${facts.root.scope.kind}`)
  for (const [kind, members] of Object.entries(facts.collections)) {
    if (kind === rootScope) throw new Error(`root scope ${rootScope} cannot also be a collection`)
    const seen = new Set<string>()
    for (const member of members) {
      const key = scopeKey(member.scope)
      if (member.scope.kind !== kind || key === kind)
        throw new Error(`invalid member scope in ${kind}`)
      if (seen.has(key)) throw new Error(`duplicate member scope ${key}`)
      seen.add(key)
    }
  }
}
