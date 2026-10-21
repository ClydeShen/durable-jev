import { z } from 'zod'
import {
  cargoItemIdSchema,
  checkIdSchema,
  evidenceRefSchema,
  legIdSchema,
  revisionSchema,
  ruleIdSchema,
  utcTimestampSchema,
} from './ids.js'
import { entityVersionsSchema } from './shipment.js'
import { checkStatusSchema, ruleEngineKindSchema } from './statuses.js'

export const checkScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('order') }),
  z.object({ kind: z.literal('cargoItem'), cargoItemId: cargoItemIdSchema }),
  z.object({ kind: z.literal('leg'), legId: legIdSchema }),
])
export type CheckScope = z.infer<typeof checkScopeSchema>

export const modelProvenanceSchema = z.object({
  provider: z.string().min(1),
  modelId: z.string().min(1),
  promptVersion: z.string().min(1),
})
export type ModelProvenance = z.infer<typeof modelProvenanceSchema>

export const checkResultSchema = z.object({
  checkId: checkIdSchema,
  ruleId: ruleIdSchema,
  ruleVersion: z.string().min(1),
  ruleSetVersion: z.string().min(1),
  scope: checkScopeSchema,
  caseRevision: revisionSchema,
  entityVersions: entityVersionsSchema,
  observedValue: z.unknown(),
  gateStatus: checkStatusSchema,
  blockedBy: z.array(ruleIdSchema),
  dependsOnResultIds: z.array(checkIdSchema),
  inputFingerprint: z.string().min(1),
  engine: ruleEngineKindSchema,
  model: modelProvenanceSchema.optional(),
  evidenceRefs: z.array(evidenceRefSchema),
  invalidatedBy: z.string().optional(),
  evaluatedAt: utcTimestampSchema,
})
export type CheckResult = z.infer<typeof checkResultSchema>
