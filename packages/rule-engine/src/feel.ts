import type { CheckScope, CheckStatus } from '@durable-jev/contracts'
import { evaluate } from 'feelin'
import type { CaseFacts, Facts } from './facts.js'

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

const contextRoots = /\b(order|cargoItems|legs|item|leg|params)((?:\.[A-Za-z_][A-Za-z0-9_]*)*)/g

function readContextPath(context: Facts, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (Array.isArray(value)) return value.map((element) => (element as Facts | undefined)?.[key])
    return value !== null && typeof value === 'object' ? (value as Facts)[key] : undefined
  }, context)
}

export function feelInputs(
  expressions: readonly string[],
  context: Facts,
): Record<string, unknown> {
  const paths = new Set(
    expressions.flatMap((expression) =>
      [...expression.matchAll(contextRoots)].map((match) => match[0]),
    ),
  )
  return Object.fromEntries([...paths].sort().map((path) => [path, readContextPath(context, path)]))
}
