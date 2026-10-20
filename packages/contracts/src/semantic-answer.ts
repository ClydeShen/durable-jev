import { z } from 'zod'
import { RuleId } from './ids.js'

export const SemanticAnswer = z.discriminatedUnion('type', [
  z.object({ type: z.literal('noul'), noul: z.number().min(0).max(1) }),
  z.object({
    type: z.literal('choice'),
    choice: z.string().min(1),
    probabilities: z.record(z.string(), z.number()),
  }),
])
export type SemanticAnswer = z.infer<typeof SemanticAnswer>

export const ScriptedSemanticAnswer = z.object({
  ruleId: RuleId,
  entityId: z.string().min(1),
  answer: SemanticAnswer,
})
export type ScriptedSemanticAnswer = z.infer<typeof ScriptedSemanticAnswer>
