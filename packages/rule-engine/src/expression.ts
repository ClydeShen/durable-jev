import { type RuleId, ruleIdSchema } from '@durable-jev/contracts'
import { z } from 'zod'

const collectionScopeSchema = z.enum(['cargoItem', 'leg'])
export type CollectionScope = z.infer<typeof collectionScopeSchema>

type FactValue = string | number | boolean

export type ValueTest = { equals: FactValue } | { includes: FactValue }

export type Expression =
  | { op: 'ref'; ruleId: RuleId }
  | { op: 'feel'; expression: string }
  | ({ op: 'observed'; ruleId: RuleId } & ValueTest)
  | { op: 'and'; of: Expression[] }
  | { op: 'or'; of: Expression[] }
  | { op: 'not'; of: Expression }
  | { op: 'ifThen'; condition: Expression; consequence: Expression }
  | { op: 'allOf'; scope: CollectionScope; of: Expression }
  | { op: 'anyOf'; scope: CollectionScope; of: Expression }

const factValueSchema = z.union([z.string(), z.number(), z.boolean()])

function withValueTest<T extends z.ZodRawShape>(shape: T) {
  return z.union([
    z.object({ ...shape, equals: factValueSchema }).strict(),
    z.object({ ...shape, includes: factValueSchema }).strict(),
  ])
}

export const expressionSchema: z.ZodType<Expression> = z.lazy(() =>
  z.union([
    z.object({ op: z.literal('feel'), expression: z.string().min(1) }).strict(),
    withValueTest({ op: z.literal('observed'), ruleId: ruleIdSchema }),
    expressionNodeSchema,
  ]),
) as z.ZodType<Expression>

const expressionNodeSchema: z.ZodType<Expression> = z.lazy(() =>
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
export const feel = (expression: string): Expression => ({ op: 'feel', expression })
export const observed = (ruleId: RuleId, test: ValueTest): Expression => ({
  op: 'observed',
  ruleId,
  ...test,
})
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

/** The rules an expression reads, in order of appearance. */
export function referencedRules(expression: Expression): RuleId[] {
  switch (expression.op) {
    case 'ref':
    case 'observed':
      return [expression.ruleId]
    case 'feel':
      return []
    case 'and':
    case 'or':
      return expression.of.flatMap(referencedRules)
    case 'not':
    case 'allOf':
    case 'anyOf':
      return referencedRules(expression.of)
    case 'ifThen':
      return [...referencedRules(expression.condition), ...referencedRules(expression.consequence)]
  }
}
