import type { CheckSubject, GateStatus, RuleId } from '@durable-jev/contracts'
import {
  combineAllOf,
  combineAnd,
  combineAnyOf,
  combineIfThen,
  combineNot,
  combineOr,
} from './combinators.rules.js'
import type { CollectionScope, Expression } from './expression.types.js'

export type ExpressionContext = {
  subject: CheckSubject
  statusOf(ruleId: RuleId, subject: CheckSubject): GateStatus
  membersOf(scope: CollectionScope): readonly string[]
}

export const evaluateExpression = (
  expression: Expression,
  context: ExpressionContext,
): GateStatus => {
  const evaluate = (inner: Expression) => evaluateExpression(inner, context)
  switch (expression.kind) {
    case 'ref':
      return context.statusOf(expression.ruleId, context.subject)
    case 'and':
      return combineAnd(expression.operands.map(evaluate))
    case 'or':
      return combineOr(expression.operands.map(evaluate))
    case 'not':
      return combineNot(evaluate(expression.operand))
    case 'ifThen':
      return combineIfThen(evaluate(expression.condition), () => evaluate(expression.consequence))
    case 'allOf':
      return combineAllOf(evaluateForEachMember(expression.scope, expression.expression, context))
    case 'anyOf':
      return combineAnyOf(evaluateForEachMember(expression.scope, expression.expression, context))
  }
}

const evaluateForEachMember = (
  scope: CollectionScope,
  expression: Expression,
  context: ExpressionContext,
): GateStatus[] => {
  return context
    .membersOf(scope)
    .map((entityId) => evaluateExpression(expression, { ...context, subject: { scope, entityId } }))
}
