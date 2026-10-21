import type { CheckScope, CheckStatus } from '@durable-jev/contracts'
import { evaluate } from 'feelin'
import type { CaseFacts, Facts } from './evaluate-rule-graph.js'

export type PolicyParameters = Record<string, string | number | boolean>

function scopeContext(facts: CaseFacts, scope: CheckScope): Facts {
  if (scope.kind === 'cargoItem') {
    return { item: facts.cargoItems.find((item) => item.cargoItemId === scope.cargoItemId)?.facts }
  }
  if (scope.kind === 'leg')
    return { leg: facts.legs.find((leg) => leg.legId === scope.legId)?.facts }
  return {}
}

export function feelContext(
  facts: CaseFacts,
  scope: CheckScope,
  parameters: PolicyParameters,
): Facts {
  return {
    order: facts.order,
    cargoItems: facts.cargoItems.map((item) => item.facts),
    legs: facts.legs.map((leg) => leg.facts),
    params: parameters,
    ...scopeContext(facts, scope),
  }
}

export function evaluateFeel(expression: string, context: Facts): unknown {
  return evaluate(expression, context).value
}

export function semanticState(
  stateExpressions: Record<string, string>,
  context: Facts,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(stateExpressions).map(([name, expression]) => [
      name,
      evaluateFeel(expression, context),
    ]),
  )
}

export function statusOfPredicate(value: unknown): CheckStatus {
  if (value === true) return 'PASS'
  if (value === false) return 'FAIL'
  if (value === null || value === undefined) return 'UNKNOWN'
  return 'ERROR'
}

export function feelSyntaxError(expression: string): string | undefined {
  try {
    evaluate(expression, {})
    return undefined
  } catch (error) {
    return String(error)
  }
}

export function parametersReferencedBy(expression: string): string[] {
  return [
    ...new Set(
      [...expression.matchAll(/\bparams\.([A-Za-z_][A-Za-z0-9_]*)/g)].map(
        (match) => match[1] as string,
      ),
    ),
  ]
}
