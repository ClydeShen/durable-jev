import type { CheckStatus } from '@durable-jev/contracts'
import type { MixingRule } from './rule-definition.js'

function pairKey(left: string, right: string): string {
  return JSON.stringify([left, right].sort())
}

export function evaluateMixing(
  matrix: readonly MixingRule[],
  categories: unknown,
  qualifications: unknown,
): { status: CheckStatus; observedValue?: unknown } {
  if (!Array.isArray(categories) || !Array.isArray(qualifications)) return { status: 'UNKNOWN' }
  const outcomes = new Map(matrix.map((entry) => [pairKey(...entry.categories), entry]))
  const present = [...new Set(categories.map(String))].sort()
  const violations = present.flatMap((left, index) =>
    present.slice(index + 1).flatMap((right) => {
      const entry = outcomes.get(pairKey(left, right))
      const label = `${left}+${right}`
      if (!entry || entry.outcome === 'forbidden') return [`${label} forbidden`]
      if (
        entry.outcome === 'requiresQualification' &&
        !qualifications.includes(entry.qualification)
      ) {
        return [`${label} needs ${entry.qualification}`]
      }
      return []
    }),
  )
  return { status: violations.length === 0 ? 'PASS' : 'FAIL', observedValue: violations }
}
