import type { RuleId } from '@durable-jev/contracts'
import type { RuleDefinition } from './rule-definition.js'

/** Undefined is unresolved; an empty collection is a resolved dimension with no matches. */
export type SelectionProfile = Readonly<Record<string, Iterable<unknown> | undefined>>

export type SelectionDecision = 'selected' | 'filtered' | 'pending'

/**
 * Index over the rules' applicability: for a domain profile it returns the rules to
 * evaluate, so the thousands that do not apply are filtered by lookup, not evaluated.
 */
export class RuleIndex {
  private readonly declared = new Map<RuleId, string[]>()
  private readonly byDimension = new Map<string, Map<string, Set<RuleId>>>()

  constructor(rules: readonly Pick<RuleDefinition, 'ruleId' | 'applicability'>[]) {
    for (const rule of rules) {
      if (!rule.applicability) continue
      const dimensions = Object.keys(rule.applicability)
      this.declared.set(rule.ruleId, dimensions)
      for (const dimension of dimensions) {
        const values = this.byDimension.get(dimension) ?? new Map<string, Set<RuleId>>()
        this.byDimension.set(dimension, values)
        for (const value of rule.applicability[dimension] ?? []) {
          values.set(value, (values.get(value) ?? new Set()).add(rule.ruleId))
        }
      }
    }
  }

  decide(ruleId: RuleId, profile: SelectionProfile): SelectionDecision {
    const dimensions = this.declared.get(ruleId)
    if (!dimensions) return 'selected'
    if (
      dimensions.some(
        (dimension) => !Object.hasOwn(profile, dimension) || profile[dimension] === undefined,
      )
    )
      return 'pending'
    const selected = dimensions.every((dimension) =>
      [...(profile[dimension] ?? [])].some((value) =>
        this.byDimension.get(dimension)?.get(String(value))?.has(ruleId),
      ),
    )
    return selected ? 'selected' : 'filtered'
  }
}
