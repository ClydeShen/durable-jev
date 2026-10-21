import { readFileSync } from 'node:fs'
import { shipmentSchema } from '@durable-jev/contracts'
import type { ScriptedJudgement } from '@durable-jev/model-providers'
import { z } from 'zod'

const judgementSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('choice'),
    choice: z.string().min(1),
    probabilities: z.record(z.string(), z.number()).optional(),
    confidence: z.number().optional(),
  }),
  z.object({ kind: z.literal('noul'), probability: z.number().min(0).max(1) }),
])

const caseFileSchema = z.object({
  story: z.string().min(1),
  shipment: shipmentSchema,
  scriptedJudgements: z.array(
    z.object({
      questionId: z.string().min(1),
      inputHash: z.string().min(1).optional(),
      judgement: judgementSchema,
    }),
  ),
})

export type CaseFile = z.infer<typeof caseFileSchema> & { scriptedJudgements: ScriptedJudgement[] }

export function loadCaseFile(path: string): CaseFile {
  return caseFileSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
}
