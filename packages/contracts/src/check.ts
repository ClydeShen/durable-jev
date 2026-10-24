import { z } from 'zod'
import { cargoItemIdSchema, legIdSchema } from './ids.js'

const legacyScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('order') }),
  z.object({ kind: z.literal('cargoItem'), cargoItemId: cargoItemIdSchema }),
  z.object({ kind: z.literal('leg'), legId: legIdSchema }),
])

const namedScopeSchema = z
  .object({ kind: z.string().regex(/^[a-z][a-zA-Z0-9]*$/) })
  .catchall(z.string().min(1))
  .refine(
    (scope) =>
      !['order', 'cargoItem', 'leg'].includes(scope.kind) &&
      Object.keys(scope).every((key) => key === 'kind' || key === 'entityId'),
    'use a named root scope or a named entity scope with entityId',
  )

/** Existing logistics scope payloads retain their original shape and required identifiers. */
export const checkScopeSchema = z.union([legacyScopeSchema, namedScopeSchema])
export type CheckScope = z.infer<typeof checkScopeSchema>
