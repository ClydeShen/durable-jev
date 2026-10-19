import { Role, RuleId, RuleScope } from '@durable-jev/contracts'
import { z } from 'zod'
import { Expression } from './expression.js'

export const EvaluatorKind = z.enum([
  'code',
  'decisionTable',
  'semantic',
  'humanGate',
  'combinator',
])
export type EvaluatorKind = z.infer<typeof EvaluatorKind>

export const RuleDefinition = z.object({
  ruleId: RuleId,
  version: z.string().min(1),
  scope: RuleScope,
  appliesWhen: Expression.optional(),
  dependsOn: z.array(RuleId),
  evaluator: z.object({ kind: EvaluatorKind, ref: z.string().min(1) }),
  combiner: Expression.optional(),
  unknownPolicy: z.enum(['block', 'escalateToHuman']),
  inputPaths: z.array(z.string()),
  parameters: z.array(z.string()),
  humanGate: z
    .object({
      taskType: z.enum(['APPROVAL', 'OPERATION']),
      requiredRole: Role,
      evidenceFields: z.array(z.string().min(1)).default([]),
      decisionConditions: z.array(z.enum(['REWORK_REQUIRED'])).default([]),
    })
    .optional(),
  invalidationTriggers: z.array(z.string()),
})
export type RuleDefinition = z.infer<typeof RuleDefinition>

export const RuleSet = z.array(RuleDefinition)
export type RuleSet = z.infer<typeof RuleSet>
