import type { RuleId } from '@durable-jev/contracts'
import type { Applicability, RuleDefinition } from './rule-definition.js'

export interface SelectionProfile {
  destination: unknown
  customer: unknown
  /** Undefined while the classifier has not decided. */
  commodityGroups: ReadonlySet<string> | undefined
}

export type SelectionDecision = 'selected' | 'filtered' | 'pending'

type Dimension = keyof Applicability

/**
 * Index over the extension rules' applicability: for an order profile it returns the rules to
 * evaluate, so the thousands that do not apply are filtered by lookup, not evaluated.
 */
export class RuleIndex {
  private readonly declared = new Map<RuleId, Dimension[]>()
  private readonly byKey = new Map<string, Set<RuleId>>()

  constructor(rules: readonly RuleDefinition[]) {
    for (const rule of rules) {
      if (!rule.applicability) continue
      const dimensions = (Object.keys(rule.applicability) as Dimension[]).filter(
        (dimension) => rule.applicability?.[dimension] !== undefined,
      )
      this.declared.set(rule.ruleId, dimensions)
      for (const dimension of dimensions) {
        for (const value of rule.applicability[dimension] ?? []) {
          const key = `${dimension}:${value}`
          this.byKey.set(key, (this.byKey.get(key) ?? new Set()).add(rule.ruleId))
        }
      }
    }
  }

  decide(ruleId: RuleId, profile: SelectionProfile): SelectionDecision {
    const dimensions = this.declared.get(ruleId)
    if (!dimensions) return 'selected'
    if (dimensions.includes('commodityGroups') && !profile.commodityGroups) return 'pending'
    const matches = (dimension: Dimension, values: Iterable<unknown>) =>
      [...values].some((value) => this.byKey.get(`${dimension}:${String(value)}`)?.has(ruleId))
    const selected = dimensions.every((dimension) => {
      if (dimension === 'destinations') return matches(dimension, [profile.destination])
      if (dimension === 'customers') return matches(dimension, [profile.customer])
      return matches(dimension, profile.commodityGroups ?? [])
    })
    return selected ? 'selected' : 'filtered'
  }
}
