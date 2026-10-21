import type { RuleId } from '@durable-jev/contracts'
import { upstreamRuleIds } from './dependency-graph.model.js'
import type { RuleDefinition } from './rule-definition.schema.js'
import {
  evaluateRuleGraph,
  type GraphSubjects,
  type LeafEvaluator,
  type RuleEvaluation,
  type RuleGraphEvaluation,
  subjectKey,
} from './rule-graph.evaluator.js'

export type ChangeSet = { changeId: string; triggers: readonly string[] }

export function invalidateDependentsOf(
  rules: readonly RuleDefinition[],
  change: ChangeSet,
): Set<RuleId> {
  const directlyAffected = rules
    .filter((rule) =>
      rule.invalidationTriggers.some((trigger) => change.triggers.includes(trigger)),
    )
    .map((rule) => rule.ruleId)

  const downstreamOf = new Map<RuleId, RuleId[]>()
  for (const rule of rules) {
    for (const upstreamRuleId of upstreamRuleIds(rule)) {
      downstreamOf.set(upstreamRuleId, [...(downstreamOf.get(upstreamRuleId) ?? []), rule.ruleId])
    }
  }

  const invalidated = new Set<RuleId>()
  const pending = [...directlyAffected]
  while (pending.length > 0) {
    const ruleId = pending.pop() as RuleId
    if (invalidated.has(ruleId)) continue
    invalidated.add(ruleId)
    pending.push(...(downstreamOf.get(ruleId) ?? []))
  }
  return invalidated
}

export type InvalidatedEvaluation = RuleEvaluation & { invalidatedByChange?: string }

export function markInvalidated(
  evaluations: readonly RuleEvaluation[],
  invalidatedRuleIds: ReadonlySet<RuleId>,
  change: ChangeSet,
): InvalidatedEvaluation[] {
  return evaluations.map((evaluation) =>
    invalidatedRuleIds.has(evaluation.ruleId)
      ? { ...evaluation, gateStatus: 'INVALIDATED', invalidatedByChange: change.changeId }
      : evaluation,
  )
}

export function recomputeInvalidated(input: {
  rulesInEvaluationOrder: readonly RuleDefinition[]
  subjects: GraphSubjects
  previous: RuleGraphEvaluation
  invalidatedRuleIds: ReadonlySet<RuleId>
  evaluateLeaf: LeafEvaluator
}): RuleGraphEvaluation {
  const previousByKey = new Map(
    input.previous.evaluations.map((evaluation) => [
      subjectKey(evaluation.ruleId, evaluation.subject),
      evaluation,
    ]),
  )
  const reuseUnaffectedLeaf: LeafEvaluator = (rule, subject) => {
    const reusable = input.invalidatedRuleIds.has(rule.ruleId)
      ? undefined
      : previousByKey.get(subjectKey(rule.ruleId, subject))
    return reusable ?? input.evaluateLeaf(rule, subject)
  }
  return evaluateRuleGraph({
    rulesInEvaluationOrder: input.rulesInEvaluationOrder,
    subjects: input.subjects,
    evaluateLeaf: reuseUnaffectedLeaf,
  })
}
