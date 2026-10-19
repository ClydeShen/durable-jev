import { readFileSync } from 'node:fs'
import { ReferenceData } from '@durable-jev/contracts'
import { type ConfigIssue, type RuleDefinition, validateRuleSet } from '@durable-jev/rule-engine'
import type { PolicyParameters } from './rules/evaluation-inputs.js'
import { knownLeafRefs } from './rules/leaf-evaluators.js'

export type RuleConfiguration = {
  ruleSetVersion: string
  rulesInEvaluationOrder: RuleDefinition[]
  policy: PolicyParameters
}

export class InvalidRuleConfigurationError extends Error {
  constructor(
    readonly issues: readonly (ConfigIssue | { kind: 'unknownEvaluator'; ref: string })[],
  ) {
    super(`rule configuration is invalid: ${JSON.stringify(issues)}`)
  }
}

export function buildRuleConfiguration(
  ruleSetFile: { ruleSetVersion: string; rules: unknown },
  policy: PolicyParameters,
): RuleConfiguration {
  const validation = validateRuleSet(ruleSetFile.rules, policy)
  if (!validation.valid) throw new InvalidRuleConfigurationError(validation.issues)

  const leafRefs = new Set(knownLeafRefs())
  const unknownEvaluators = validation.rules
    .filter((rule) => rule.evaluator.kind !== 'combinator' && rule.evaluator.kind !== 'humanGate')
    .filter((rule) => !leafRefs.has(rule.evaluator.ref))
    .map((rule) => ({ kind: 'unknownEvaluator' as const, ref: rule.evaluator.ref }))
  if (unknownEvaluators.length > 0) throw new InvalidRuleConfigurationError(unknownEvaluators)

  const rulesById = new Map(validation.rules.map((rule) => [rule.ruleId, rule]))
  return {
    ruleSetVersion: ruleSetFile.ruleSetVersion,
    rulesInEvaluationOrder: validation.evaluationOrder.map(
      (ruleId) => rulesById.get(ruleId) as RuleDefinition,
    ),
    policy,
  }
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))

export function loadRuleConfiguration(paths: {
  rulesPath: string
  policyPath: string
}): RuleConfiguration {
  return buildRuleConfiguration(
    readJson(paths.rulesPath) as { ruleSetVersion: string; rules: unknown },
    readJson(paths.policyPath) as PolicyParameters,
  )
}

export function loadReferenceData(path: string): ReferenceData {
  return ReferenceData.parse(readJson(path))
}
