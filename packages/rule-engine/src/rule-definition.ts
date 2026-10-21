import {
  agentIdSchema,
  cargoCategorySchema,
  roleSchema,
  ruleEngineKindSchema,
  ruleIdSchema,
} from '@durable-jev/contracts'
import { z } from 'zod'
import { expressionSchema } from './expression.js'

const ruleScopeSchema = z.enum(['order', 'cargoItem', 'leg'])
export type RuleScope = z.infer<typeof ruleScopeSchema>

export const invalidationTriggers = ['cargo', 'route', 'carrier', 'quote', 'documents'] as const
const invalidationTriggerSchema = z.enum(invalidationTriggers)
export type InvalidationTrigger = z.infer<typeof invalidationTriggerSchema>

const humanGateSchema = z.object({
  taskType: z.enum(['APPROVAL', 'OPERATION']),
  steps: z
    .array(z.object({ requiredRole: roleSchema, appliesWhen: expressionSchema.optional() }))
    .min(1)
    .max(3),
  mode: z.enum(['sequential', 'parallel']),
  distinctActors: z.boolean(),
  evidenceRequirements: z.array(z.string().min(1)),
  expiresAfterHours: z.number().positive(),
})
export type HumanGate = z.infer<typeof humanGateSchema>

const expressionRuleSchema = z.object({
  passWhen: z.string().min(1),
  observe: z.string().min(1).optional(),
})

const probabilityThresholdSchema = z.union([z.number().min(0).max(1), z.string().min(1)])

const mixingTableSchema = z.object({
  categories: z.string().min(1),
  qualifications: z.string().min(1),
})

const semanticRuleSchema = z.object({
  promptVersion: z.string().min(1),
  question: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('choice'),
      text: z.string().min(1),
      options: z.record(z.string(), z.string().min(1)),
    }),
    z.object({ kind: z.literal('noul'), text: z.string().min(1) }),
  ]),
  state: z.record(z.string(), z.string().min(1)),
  passWhen: z.union([
    z.object({ choiceIn: z.array(z.string().min(1)).min(1) }),
    z.object({ probabilityAtLeast: probabilityThresholdSchema }),
    z.object({ probabilityAtMost: probabilityThresholdSchema }),
  ]),
})
export type SemanticRule = z.infer<typeof semanticRuleSchema>

const applicabilitySchema = z.object({
  destinations: z.array(z.string().min(1)).min(1).optional(),
  cargoCategories: z.array(cargoCategorySchema).min(1).optional(),
  customers: z.array(z.string().min(1)).min(1).optional(),
})

const ruleDefinitionSchema = z.object({
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
  expression: expressionRuleSchema.optional(),
  mixing: mixingTableSchema.optional(),
  semantic: semanticRuleSchema.optional(),
  unknownPolicy: z.enum(['block', 'escalateToHuman']),
  inputPaths: z.array(z.string().min(1)),
  parameters: z.array(z.string().min(1)),
  humanGate: humanGateSchema.optional(),
  invalidationTriggers: z.array(invalidationTriggerSchema),
})
export type RuleDefinition = z.infer<typeof ruleDefinitionSchema>

const mixingRuleSchema = z.object({
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
