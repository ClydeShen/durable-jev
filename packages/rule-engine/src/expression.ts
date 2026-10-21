import { type RuleId, ruleIdSchema } from '@durable-jev/contracts'
import { z } from 'zod'

export const collectionScopeSchema = z.enum(['cargoItem', 'leg'])
export type CollectionScope = z.infer<typeof collectionScopeSchema>

export type Expression =
  | { op: 'ref'; ruleId: RuleId }
  | { op: 'and'; of: Expression[] }
  | { op: 'or'; of: Expression[] }
  | { op: 'not'; of: Expression }
  | { op: 'ifThen'; condition: Expression; consequence: Expression }
  | { op: 'allOf'; scope: CollectionScope; of: Expression }
  | { op: 'anyOf'; scope: CollectionScope; of: Expression }

export const expressionSchema: z.ZodType<Expression> = z.lazy(() =>
  z.discriminatedUnion('op', [
    z.object({ op: z.literal('ref'), ruleId: ruleIdSchema }),
    z.object({ op: z.literal('and'), of: z.array(expressionSchema).min(1) }),
    z.object({ op: z.literal('or'), of: z.array(expressionSchema).min(1) }),
    z.object({ op: z.literal('not'), of: expressionSchema }),
    z.object({
      op: z.literal('ifThen'),
      condition: expressionSchema,
      consequence: expressionSchema,
    }),
    z.object({ op: z.literal('allOf'), scope: collectionScopeSchema, of: expressionSchema }),
    z.object({ op: z.literal('anyOf'), scope: collectionScopeSchema, of: expressionSchema }),
  ]),
)

export const ref = (ruleId: RuleId): Expression => ({ op: 'ref', ruleId })
export const and = (...of: Expression[]): Expression => ({ op: 'and', of })
export const or = (...of: Expression[]): Expression => ({ op: 'or', of })
export const not = (of: Expression): Expression => ({ op: 'not', of })
export const ifThen = (condition: Expression, consequence: Expression): Expression => ({
  op: 'ifThen',
  condition,
  consequence,
})
export const allOf = (scope: CollectionScope, of: Expression): Expression => ({
  op: 'allOf',
  scope,
  of,
})
export const anyOf = (scope: CollectionScope, of: Expression): Expression => ({
  op: 'anyOf',
  scope,
  of,
})
