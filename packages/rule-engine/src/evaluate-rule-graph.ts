import {
  type CheckSubject,
  type GateStatus,
  isPendingGateStatus,
  type RuleId,
} from '@durable-jev/contracts'
import { combineAllOf } from './combinators.js'
import { type ExpressionContext, evaluateExpression } from './evaluate-expression.js'
import { type CollectionScope, referencedRuleIds } from './expression.js'
import type { RuleDefinition } from './rule-definition.js'

export type GraphSubjects = Readonly<Record<CollectionScope, readonly string[]>>

export type LeafOutcome = { gateStatus: GateStatus; observedValue?: unknown }

export type LeafEvaluator = (rule: RuleDefinition, subject: CheckSubject) => LeafOutcome

export type RuleEvaluation = {
  ruleId: RuleId
  subject: CheckSubject
  gateStatus: GateStatus
  observedValue?: unknown
  blockedBy: RuleId[]
}

export type RuleGraphEvaluation = {
  evaluations: RuleEvaluation[]
  statusOf(ruleId: RuleId, subject?: CheckSubject): GateStatus
}

export const orderSubject: CheckSubject = { scope: 'order', entityId: 'order' }

export function subjectKey(ruleId: RuleId, subject: CheckSubject): string {
  return `${ruleId}@${subject.scope}:${subject.entityId}`
}

export function evaluateRuleGraph(input: {
  rulesInEvaluationOrder: readonly RuleDefinition[]
  subjects: GraphSubjects
  evaluateLeaf: LeafEvaluator
}): RuleGraphEvaluation {
  const { rulesInEvaluationOrder, subjects, evaluateLeaf } = input
  const rulesById = new Map(rulesInEvaluationOrder.map((rule) => [rule.ruleId, rule]))
  const results = new Map<string, RuleEvaluation>()

  const statusOf = (ruleId: RuleId, subject: CheckSubject = orderSubject): GateStatus => {
    const upstreamScope = rulesById.get(ruleId)?.scope
    if (!upstreamScope) return 'ERROR'
    if (upstreamScope === 'order') return storedStatus(ruleId, orderSubject)
    if (upstreamScope === subject.scope) return storedStatus(ruleId, subject)
    return combineAllOf(
      subjects[upstreamScope].map((entityId) =>
        storedStatus(ruleId, { scope: upstreamScope, entityId }),
      ),
    )
  }

  const storedStatus = (ruleId: RuleId, subject: CheckSubject): GateStatus =>
    results.get(subjectKey(ruleId, subject))?.gateStatus ?? 'UNKNOWN'

  for (const rule of rulesInEvaluationOrder) {
    for (const subject of subjectsInScope(rule, subjects)) {
      const evaluation = evaluateRule(rule, subject, { statusOf, subjects, evaluateLeaf })
      results.set(subjectKey(rule.ruleId, subject), evaluation)
    }
  }

  return { evaluations: [...results.values()], statusOf }
}

function subjectsInScope(rule: RuleDefinition, subjects: GraphSubjects): CheckSubject[] {
  if (rule.scope === 'order') return [orderSubject]
  return subjects[rule.scope].map((entityId) => ({ scope: rule.scope, entityId }))
}

type RuleEvaluationDependencies = {
  statusOf(ruleId: RuleId, subject: CheckSubject): GateStatus
  subjects: GraphSubjects
  evaluateLeaf: LeafEvaluator
}

function evaluateRule(
  rule: RuleDefinition,
  subject: CheckSubject,
  dependencies: RuleEvaluationDependencies,
): RuleEvaluation {
  const { statusOf, subjects, evaluateLeaf } = dependencies
  const expressionContext: ExpressionContext = {
    subject,
    statusOf,
    membersOf: (scope) => subjects[scope],
  }
  const unsettledAmong = (ruleIds: readonly RuleId[], isSettled: (status: GateStatus) => boolean) =>
    ruleIds.filter((ruleId) => !isSettled(statusOf(ruleId, subject)))
  const result = (gateStatus: GateStatus, blockedBy: RuleId[] = [], observedValue?: unknown) => ({
    ruleId: rule.ruleId,
    subject,
    gateStatus,
    blockedBy,
    ...(observedValue === undefined ? {} : { observedValue }),
  })

  if (rule.appliesWhen) {
    const applicability = evaluateExpression(rule.appliesWhen, expressionContext)
    if (applicability === 'FAIL' || applicability === 'NOT_APPLICABLE') {
      return result('NOT_APPLICABLE')
    }
    if (applicability !== 'PASS') {
      const blockers = unsettledAmong(referencedRuleIds(rule.appliesWhen), isDecided)
      return result('BLOCKED_DEPENDENCY', blockers)
    }
  }

  if (rule.combiner) {
    const gateStatus = evaluateExpression(rule.combiner, expressionContext)
    const blockers = isPendingGateStatus(gateStatus)
      ? unsettledAmong(referencedRuleIds(rule.combiner), isDecided)
      : []
    return result(gateStatus, blockers)
  }

  const unmetDependencies = unsettledAmong(rule.dependsOn, isSatisfied)
  if (unmetDependencies.length > 0) return result('BLOCKED_DEPENDENCY', unmetDependencies)

  const outcome = evaluateLeaf(rule, subject)
  const gateStatus =
    outcome.gateStatus === 'UNKNOWN' && rule.unknownPolicy === 'escalateToHuman'
      ? 'WAITING_HUMAN'
      : outcome.gateStatus
  return result(gateStatus, [], outcome.observedValue)
}

function isSatisfied(status: GateStatus): boolean {
  return status === 'PASS' || status === 'NOT_APPLICABLE'
}

function isDecided(status: GateStatus): boolean {
  return !isPendingGateStatus(status)
}
