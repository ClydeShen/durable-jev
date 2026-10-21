import { RuleId } from '@durable-jev/contracts'
import { z } from 'zod'

export const CollectionScope = z.enum(['cargoItem', 'leg'])
export type CollectionScope = z.infer<typeof CollectionScope>

export type Expression =
  | { kind: 'ref'; ruleId: RuleId }
  | { kind: 'and'; operands: Expression[] }
  | { kind: 'or'; operands: Expression[] }
  | { kind: 'not'; operand: Expression }
  | { kind: 'ifThen'; condition: Expression; consequence: Expression }
  | { kind: 'allOf'; scope: CollectionScope; expression: Expression }
  | { kind: 'anyOf'; scope: CollectionScope; expression: Expression }

export const Expression: z.ZodType<Expression> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('ref'), ruleId: RuleId }),
    z.object({ kind: z.literal('and'), operands: z.array(Expression).min(1) }),
    z.object({ kind: z.literal('or'), operands: z.array(Expression).min(1) }),
    z.object({ kind: z.literal('not'), operand: Expression }),
    z.object({ kind: z.literal('ifThen'), condition: Expression, consequence: Expression }),
    z.object({ kind: z.literal('allOf'), scope: CollectionScope, expression: Expression }),
    z.object({ kind: z.literal('anyOf'), scope: CollectionScope, expression: Expression }),
  ]),
)

export const referencedRuleIds = (expression: Expression): RuleId[] => {
  switch (expression.kind) {
    case 'ref':
      return [expression.ruleId]
    case 'and':
    case 'or':
      return expression.operands.flatMap(referencedRuleIds)
    case 'not':
      return referencedRuleIds(expression.operand)
    case 'ifThen':
      return [
        ...referencedRuleIds(expression.condition),
        ...referencedRuleIds(expression.consequence),
      ]
    case 'allOf':
    case 'anyOf':
      return referencedRuleIds(expression.expression)
  }
}
