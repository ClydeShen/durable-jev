import {
  type CheckScope,
  type CheckStatus,
  isPendingCheckStatus,
  type RuleId,
} from '@durable-jev/contracts'
import {
  combineAllOf,
  combineAnd,
  combineAnyOf,
  combineIfThen,
  combineOr,
  negate,
  type Outcome,
  outcome,
} from './combinators.js'
import type { CollectionScope, Expression, ValueTest } from './expression.js'
import { statusOfPredicate } from './feel.js'

export interface ExpressionContext {
  statusOf(ruleId: RuleId, scope: CheckScope): CheckStatus
  observedValueOf(ruleId: RuleId, scope: CheckScope): unknown
  feel(expression: string, scope: CheckScope): unknown
  membersOf(scope: CollectionScope): CheckScope[]
}

function testValue(value: unknown, test: ValueTest): Outcome {
  if (value === undefined || value === null) return outcome('UNKNOWN')
  if ('equals' in test) return outcome(value === test.equals ? 'PASS' : 'FAIL')
  if (!Array.isArray(value)) return outcome('ERROR')
  return outcome(value.includes(test.includes) ? 'PASS' : 'FAIL')
}

function evaluateObserved(
  ruleId: RuleId,
  test: ValueTest,
  scope: CheckScope,
  context: ExpressionContext,
): Outcome {
  const status = context.statusOf(ruleId, scope)
  if (isPendingCheckStatus(status)) return outcome(status, [ruleId])
  if (status === 'ERROR' || status === 'NOT_APPLICABLE') return outcome(status)
  return testValue(context.observedValueOf(ruleId, scope), test)
}

function evaluateRef(ruleId: RuleId, scope: CheckScope, context: ExpressionContext): Outcome {
  const status = context.statusOf(ruleId, scope)
  return outcome(status, isPendingCheckStatus(status) ? [ruleId] : [])
}

export function evaluateExpression(
  expression: Expression,
  context: ExpressionContext,
  scope: CheckScope = { kind: 'order' },
): Outcome {
  const evaluate = (child: Expression, childScope: CheckScope = scope) =>
    evaluateExpression(child, context, childScope)
  switch (expression.op) {
    case 'ref':
      return evaluateRef(expression.ruleId, scope, context)
    case 'feel':
      return outcome(statusOfPredicate(context.feel(expression.expression, scope)))
    case 'observed':
      return evaluateObserved(expression.ruleId, expression, scope, context)
    case 'and':
      return combineAnd(expression.of.map((child) => evaluate(child)))
    case 'or':
      return combineOr(expression.of.map((child) => evaluate(child)))
    case 'not':
      return negate(evaluate(expression.of))
    case 'ifThen':
      return combineIfThen(evaluate(expression.condition), () => evaluate(expression.consequence))
    case 'allOf':
      return combineAllOf(
        context.membersOf(expression.scope).map((member) => evaluate(expression.of, member)),
      )
    case 'anyOf':
      return combineAnyOf(
        context.membersOf(expression.scope).map((member) => evaluate(expression.of, member)),
      )
  }
}
