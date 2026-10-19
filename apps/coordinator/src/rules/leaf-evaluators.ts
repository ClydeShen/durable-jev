import type { CheckSubject } from '@durable-jev/contracts'
import type { LeafOutcome, RuleDefinition } from '@durable-jev/rule-engine'
import { baseLeafRules } from './base-rules.js'
import { commercialLeafRules } from './commercial-rules.js'
import type { EvaluationInputs } from './evaluation-inputs.js'
import { type LeafRule, outcome } from './leaf-helpers.js'
import { transportLeafRules } from './transport-rules.js'

const humanGate =
  (rule: RuleDefinition): LeafRule =>
  (subject, inputs) =>
    outcome(inputs.humanGateStatus(rule, subject))

const leafRulesByRef: Readonly<Record<string, LeafRule>> = {
  ...baseLeafRules,
  ...transportLeafRules,
  ...commercialLeafRules,
}

export function knownLeafRefs(): string[] {
  return Object.keys(leafRulesByRef)
}

export function evaluateLeafRule(
  rule: RuleDefinition,
  subject: CheckSubject,
  inputs: EvaluationInputs,
): LeafOutcome {
  if (rule.evaluator.kind === 'humanGate') return humanGate(rule)(subject, inputs)
  const leafRule = leafRulesByRef[rule.evaluator.ref]
  if (!leafRule) return outcome('ERROR', { reason: `no evaluator for ${rule.evaluator.ref}` })
  return leafRule(subject, inputs)
}
