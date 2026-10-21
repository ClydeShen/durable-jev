import {
  agentIdSchema,
  cargoCategorySchema,
  roleSchema,
  ruleEngineKindSchema,
  ruleIdSchema,
} from '@durable-jev/contracts'
import { z } from 'zod'
import { expressionSchema } from './expression.js'

export const ruleScopeSchema = z.enum(['order', 'cargoItem', 'leg'])
export type RuleScope = z.infer<typeof ruleScopeSchema>

export const invalidationTriggerSchema = z.enum(['cargo', 'route', 'carrier', 'quote', 'documents'])
export type InvalidationTrigger = z.infer<typeof invalidationTriggerSchema>

export const humanGateSchema = z.object({
  taskType: z.enum(['APPROVAL', 'OPERATION']),
  steps: z
    .array(z.object({ requiredRole: roleSchema, appliesWhen: expressionSchema.optional() }))
    .min(1)
    .max(3),
  mode: z.enum(['sequential', 'parallel']),
  distinctActors: z.boolean(),
})
export type HumanGate = z.infer<typeof humanGateSchema>

export const applicabilitySchema = z.object({
  destinations: z.array(z.string().min(1)).min(1).optional(),
  cargoCategories: z.array(cargoCategorySchema).min(1).optional(),
  customers: z.array(z.string().min(1)).min(1).optional(),
})
export type Applicability = z.infer<typeof applicabilitySchema>

export const ruleDefinitionSchema = z.object({
  ruleId: ruleIdSchema,
  version: z.string().min(1),
  title: z.string().min(1),
  owner: agentIdSchema,
  scope: ruleScopeSchema,
  applicability: applicabilitySchema.optional(),
  appliesWhen: expressionSchema.optional(),
  dependsOn: z.array(ruleIdSchema),
  evaluator: z.object({ kind: ruleEngineKindSchema, ref: z.string().min(1) }),
  combiner: expressionSchema.optional(),
  unknownPolicy: z.enum(['block', 'escalateToHuman']),
  inputPaths: z.array(z.string().min(1)),
  parameters: z.array(z.string().min(1)),
  humanGate: humanGateSchema.optional(),
  invalidationTriggers: z.array(invalidationTriggerSchema),
})
export type RuleDefinition = z.infer<typeof ruleDefinitionSchema>

export const mixingRuleSchema = z.object({
  categories: z.tuple([cargoCategorySchema, cargoCategorySchema]),
  outcome: z.enum(['allowed', 'forbidden', 'requiresQualification']),
  qualification: z.string().min(1).optional(),
})
export type MixingRule = z.infer<typeof mixingRuleSchema>

export const ruleSetSchema = z.object({
  ruleSetVersion: z.string().min(1),
  rules: z.array(ruleDefinitionSchema).min(1),
  mixingMatrix: z.array(mixingRuleSchema),
})
export type RuleSet = z.infer<typeof ruleSetSchema>
