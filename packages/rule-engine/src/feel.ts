import type { CheckScope, CheckStatus } from '@durable-jev/contracts'
import { evaluate } from 'feelin'
import { type CaseFacts, type Facts, factsInScope, factValue } from './facts.js'

export type PolicyParameters = Record<string, string | number | boolean>

export function feelContext(
  facts: CaseFacts,
  scope: CheckScope,
  parameters: PolicyParameters,
): Facts {
  return {
    ...facts.context,
    ...factsInScope(facts, scope)?.context,
    params: parameters,
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

const contextPaths = /\b[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/g

export function feelInputs(
  expressions: readonly string[],
  context: Facts,
): Record<string, unknown> {
  const paths = new Set(
    expressions.flatMap((expression) =>
      [...expression.matchAll(contextPaths)]
        .map((match) => match[0])
        .filter((path) => Object.hasOwn(context, path.split('.')[0] ?? '')),
    ),
  )
  return Object.fromEntries([...paths].sort().map((path) => [path, factValue(context, path)]))
}
