import type { InvalidationTrigger } from './rule-definition.js'

/** One scope's readable data: the order, a cargo item or a leg. */
export type Facts = Record<string, unknown>

/** Everything rules can read about a case, plus the entity versions that drive invalidation. */
export interface CaseFacts {
  entityVersions: Partial<Record<InvalidationTrigger, number | string>>
  order: Facts
  cargoItems: { cargoItemId: string; facts: Facts }[]
  legs: { legId: string; facts: Facts }[]
}
