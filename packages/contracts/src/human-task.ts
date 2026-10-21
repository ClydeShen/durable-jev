import { z } from 'zod'
import { checkScopeSchema } from './check.js'
import {
  caseIdSchema,
  evidenceRefSchema,
  humanTaskIdSchema,
  revisionSchema,
  ruleIdSchema,
  utcTimestampSchema,
} from './ids.js'
import { entityVersionsSchema } from './shipment.js'
import { humanTaskStatusSchema, humanTaskTypeSchema, roleSchema } from './statuses.js'

export const humanTaskTargetSchema = z.object({
  caseRevision: revisionSchema,
  entityVersions: entityVersionsSchema,
  inputFingerprint: z.string().min(1),
})
export type HumanTaskTarget = z.infer<typeof humanTaskTargetSchema>

export const humanDecisionSchema = z.object({
  outcome: z.enum(['APPROVED', 'REJECTED']),
  decidedByRole: roleSchema,
  decidedBy: z.string().min(1),
  decidedAt: utcTimestampSchema,
  comment: z.string().optional(),
})
export type HumanDecision = z.infer<typeof humanDecisionSchema>

export const actionEvidenceSchema = z.object({
  completedByRole: roleSchema,
  completedBy: z.string().min(1),
  completedAt: utcTimestampSchema,
  fields: z.record(z.string(), z.unknown()),
  evidenceRefs: z.array(evidenceRefSchema),
})
export type ActionEvidence = z.infer<typeof actionEvidenceSchema>

export const approvalModeSchema = z.enum(['sequential', 'parallel'])
export type ApprovalMode = z.infer<typeof approvalModeSchema>

export const approvalChainStepSchema = z
  .object({
    chainId: z.string().min(1),
    mode: approvalModeSchema,
    distinctActors: z.boolean(),
    stepIndex: z.number().int().nonnegative(),
    stepCount: z.number().int().positive(),
  })
  .refine((step) => step.stepIndex < step.stepCount, 'stepIndex must be below stepCount')
export type ApprovalChainStep = z.infer<typeof approvalChainStepSchema>

const terminalOutcomeFields = {
  APPROVED: 'decision',
  REJECTED: 'decision',
  COMPLETED: 'actionEvidence',
} as const

export const humanTaskSchema = z
  .object({
    humanTaskId: humanTaskIdSchema,
    caseId: caseIdSchema,
    ruleId: ruleIdSchema,
    scope: checkScopeSchema,
    taskType: humanTaskTypeSchema,
    requiredRole: roleSchema,
    prerequisites: z.array(ruleIdSchema),
    evidenceRequirements: z.array(z.string().min(1)),
    target: humanTaskTargetSchema,
    status: humanTaskStatusSchema,
    decision: humanDecisionSchema.optional(),
    actionEvidence: actionEvidenceSchema.optional(),
    createdAt: utcTimestampSchema,
    expiresAt: utcTimestampSchema,
    supersededBy: humanTaskIdSchema.optional(),
    approvalChain: approvalChainStepSchema.optional(),
  })
  .superRefine((task, context) => {
    const expectedField =
      task.status in terminalOutcomeFields
        ? terminalOutcomeFields[task.status as keyof typeof terminalOutcomeFields]
        : undefined
    if (expectedField === 'decision' && task.taskType !== 'APPROVAL') {
      context.addIssue({ code: 'custom', message: 'only APPROVAL tasks are approved or rejected' })
    }
    if (expectedField === 'actionEvidence' && task.taskType !== 'OPERATION') {
      context.addIssue({ code: 'custom', message: 'only OPERATION tasks are completed' })
    }
    if (expectedField && !task[expectedField]) {
      context.addIssue({ code: 'custom', message: `${task.status} requires ${expectedField}` })
    }
    if (expectedField === 'decision' && task.decision?.outcome !== task.status) {
      context.addIssue({ code: 'custom', message: 'decision outcome must match status' })
    }
    if (task.approvalChain && task.taskType !== 'APPROVAL') {
      context.addIssue({
        code: 'custom',
        message: 'only APPROVAL tasks belong to an approval chain',
      })
    }
    if ((task.status === 'SUPERSEDED') !== Boolean(task.supersededBy)) {
      context.addIssue({ code: 'custom', message: 'supersededBy is set exactly when SUPERSEDED' })
    }
  })
export type HumanTask = z.infer<typeof humanTaskSchema>
