import { z } from 'zod'
import { cargoItemIdSchema, legIdSchema } from './ids.js'

export const checkScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('order') }),
  z.object({ kind: z.literal('cargoItem'), cargoItemId: cargoItemIdSchema }),
  z.object({ kind: z.literal('leg'), legId: legIdSchema }),
])
export type CheckScope = z.infer<typeof checkScopeSchema>
