import { readFileSync } from 'node:fs'
import {
  checkStatusSchema,
  orderStatusSchema,
  roleSchema,
  shipmentSchema,
} from '@durable-jev/contracts'
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

const actorSchema = z.object({ id: z.string().min(1), role: roleSchema })

const decisionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.enum(['approve', 'reject']), comment: z.string().optional() }),
  z.object({
    type: z.literal('complete'),
    fields: z.record(z.string(), z.string()),
    evidenceRefs: z.array(z.string()).default([]),
  }),
])

const caseEventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('expect'),
    label: z.string().min(1),
    orderStatus: orderStatusSchema.optional(),
    statuses: z.record(z.string(), checkStatusSchema).default({}),
    openTasks: z.array(z.string()).optional(),
    reused: z.array(z.string()).optional(),
    invalidatedBy: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    kind: z.literal('act'),
    label: z.string().min(1),
    task: z.string().min(1),
    actor: actorSchema,
    decision: decisionSchema,
    expectRefusal: z.string().optional(),
  }),
  z.object({
    kind: z.literal('revise'),
    label: z.string().min(1),
    patch: z.record(z.string(), z.unknown()),
  }),
  z.object({
    kind: z.literal('dispatch'),
    label: z.string().min(1),
    actor: actorSchema,
    expectRefusal: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal('advanceClock'),
    label: z.string().min(1),
    hours: z.number().positive(),
  }),
])

export type CaseEvent = z.infer<typeof caseEventSchema>

const caseFileSchema = z.object({
  story: z.string().min(1),
  reviewStatus: z.enum(['draft', 'reviewed']),
  shipment: shipmentSchema,
  scriptedJudgements: z.array(
    z.object({
      questionId: z.string().min(1),
      inputHash: z.string().min(1).optional(),
      stateIncludes: z.string().min(1).optional(),
      judgement: judgementSchema,
    }),
  ),
  events: z.array(caseEventSchema).default([]),
})

export type CaseFile = z.infer<typeof caseFileSchema> & { scriptedJudgements: ScriptedJudgement[] }

export function loadCaseFile(path: string): CaseFile {
  return caseFileSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
}
