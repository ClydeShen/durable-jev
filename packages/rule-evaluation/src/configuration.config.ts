import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ReferenceData } from '@durable-jev/contracts'
import {
  SemanticQuestionCatalog,
  type SemanticQuestionTemplate,
} from '@durable-jev/model-providers'
import { type ConfigIssue, type RuleDefinition, validateRuleSet } from '@durable-jev/rule-engine'
import { type DecisionTables, MixingMatrix } from './decision-tables.rules.js'
import type { PolicyParameters } from './evaluation-inputs.types.js'
import { knownLeafRefs } from './leaf.evaluator.js'

export type RuleConfiguration = {
  ruleSetVersion: string
  rulesInEvaluationOrder: RuleDefinition[]
  policy: PolicyParameters
  decisionTables: DecisionTables
  semanticQuestions: SemanticQuestionTemplate[]
  categoryDefinitions: Record<string, string>
}

export class InvalidRuleConfigurationError extends Error {
  constructor(
    readonly issues: readonly (
      | ConfigIssue
      | { kind: 'unknownEvaluator'; ref: string }
      | { kind: 'missingSemanticQuestion'; ruleId: string }
    )[],
  ) {
    super(`rule configuration is invalid: ${JSON.stringify(issues)}`)
  }
}

export const buildRuleConfiguration = (
  ruleSetFile: { ruleSetVersion: string; rules: unknown },
  policy: PolicyParameters,
  tables: { mixingMatrix: unknown; semanticQuestions: unknown },
): RuleConfiguration => {
  const validation = validateRuleSet(ruleSetFile.rules, policy)
  if (!validation.valid) throw new InvalidRuleConfigurationError(validation.issues)

  const leafRefs = new Set(knownLeafRefs())
  const unknownEvaluators = validation.rules
    .filter((rule) => rule.evaluator.kind !== 'combinator' && rule.evaluator.kind !== 'humanGate')
    .filter((rule) => !leafRefs.has(rule.evaluator.ref))
    .map((rule) => ({ kind: 'unknownEvaluator' as const, ref: rule.evaluator.ref }))
  if (unknownEvaluators.length > 0) throw new InvalidRuleConfigurationError(unknownEvaluators)

  const { questions: semanticQuestions, categoryDefinitions } = SemanticQuestionCatalog.parse(
    tables.semanticQuestions,
  )
  const askedRuleIds = new Set(semanticQuestions.map((question) => question.ruleId))
  const unasked = validation.rules
    .filter((rule) => rule.evaluator.kind === 'semantic' && !askedRuleIds.has(rule.ruleId))
    .map((rule) => ({ kind: 'missingSemanticQuestion' as const, ruleId: rule.ruleId }))
  if (unasked.length > 0) throw new InvalidRuleConfigurationError(unasked)

  const rulesById = new Map(validation.rules.map((rule) => [rule.ruleId, rule]))
  return {
    ruleSetVersion: ruleSetFile.ruleSetVersion,
    rulesInEvaluationOrder: validation.evaluationOrder.map(
      (ruleId) => rulesById.get(ruleId) as RuleDefinition,
    ),
    policy,
    decisionTables: { mixingMatrix: MixingMatrix.parse(tables.mixingMatrix) },
    semanticQuestions,
    categoryDefinitions,
  }
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))

export const loadRuleConfiguration = (materialsDirectory: string): RuleConfiguration => {
  const material = (path: string) => readJson(join(materialsDirectory, path))
  return buildRuleConfiguration(
    material('rules.json') as { ruleSetVersion: string; rules: unknown },
    material('mock-policy-parameters.json') as PolicyParameters,
    {
      mixingMatrix: material('decision-tables/mixing-matrix.json'),
      semanticQuestions: material('semantic-questions.json'),
    },
  )
}

export const loadReferenceData = (path: string): ReferenceData => {
  return ReferenceData.parse(readJson(path))
}
