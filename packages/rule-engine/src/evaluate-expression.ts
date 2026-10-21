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
import type { CollectionScope, Expression } from './expression.js'

export interface ExpressionContext {
  statusOf(ruleId: RuleId, scope: CheckScope): CheckStatus
  membersOf(scope: CollectionScope): CheckScope[]
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
