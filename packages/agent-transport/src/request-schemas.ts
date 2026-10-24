import { roleSchema } from '@durable-jev/contracts'
import type { HumanAction } from '@durable-jev/human-tasks'
import { z } from 'zod'

const actorSchema = z.object({ id: z.string().min(1), role: roleSchema })

/** Carry-forward is runtime reconciliation, not a remotely submitted decision. */
export const actionSchema: z.ZodType<HumanAction> = z.discriminatedUnion('type', [
  z.object({
    type: z.enum(['approve', 'reject']),
    actor: actorSchema,
    comment: z.string().optional(),
  }),
  z.object({
    type: z.literal('complete'),
    actor: actorSchema,
    fields: z.record(z.string(), z.unknown()),
    evidenceRefs: z.array(z.string().min(1)),
  }),
  z.object({ type: z.literal('expire') }),
  z.object({ type: z.literal('cancel') }),
  z.object({ type: z.literal('supersede'), by: z.string().min(1) }),
])
