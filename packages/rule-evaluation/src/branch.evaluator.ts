import type {
  BranchEvaluationRequest,
  BranchEvaluationResult,
  CheckSubject,
  HumanGateRequest,
  HumanGateState,
  ReferenceData,
  RuleBranch,
} from '@durable-jev/contracts'
import {
  evaluateRuleGraph,
  type LeafOutcome,
  type RuleDefinition,
  upstreamRuleIds,
} from '@durable-jev/rule-engine'
import type { RuleConfiguration } from './configuration.config.js'
import type { EvaluationInputs } from './evaluation-inputs.types.js'
import { evaluateLeafRule } from './leaf.evaluator.js'

export type BranchEvaluationDependencies = {
  configuration: RuleConfiguration
  referenceData: ReferenceData
  branches: readonly RuleBranch[]
  ensurePlanReservation?: (request: BranchEvaluationRequest) => boolean
}

const gateKey = (ruleId: string, entityId: string) => `${ruleId}@${entityId}`

export function rulesOfBranches(
  rules: readonly RuleDefinition[],
  branches: readonly RuleBranch[],
): RuleDefinition[] {
  return rules.filter((rule) => rule.branch !== undefined && branches.includes(rule.branch))
}

export function requiredUpstreamRuleIds(
  rules: readonly RuleDefinition[],
  branches: readonly RuleBranch[],
): string[] {
  const owned = rulesOfBranches(rules, branches)
  const ownedIds = new Set(owned.map((rule) => rule.ruleId as string))
  return [...new Set(owned.flatMap(upstreamRuleIds))].filter((ruleId) => !ownedIds.has(ruleId))
}

export function humanGateRuleIds(
  rules: readonly RuleDefinition[],
  branches: readonly RuleBranch[],
) {
  return rulesOfBranches(rules, branches)
    .filter((rule) => rule.humanGate !== undefined)
    .map((rule) => rule.ruleId as string)
}

export function evaluateBranch(
  request: BranchEvaluationRequest,
  dependencies: BranchEvaluationDependencies,
): BranchEvaluationResult {
  return evaluateOwnedRules(
    request,
    dependencies,
    rulesOfBranches(dependencies.configuration.rulesInEvaluationOrder, dependencies.branches),
    dependencies.branches.join(', '),
  )
}

// Re-evaluates only the given rules and takes every other result from the request, e.g.
// "with everything else as it is now, would this carrier fit?". Nothing is reserved.
export function evaluateSelectedRules(
  request: BranchEvaluationRequest,
  dependencies: Omit<BranchEvaluationDependencies, 'branches' | 'ensurePlanReservation'> & {
    ruleIds: readonly string[]
  },
): BranchEvaluationResult {
  const selected = new Set(dependencies.ruleIds)
  return evaluateOwnedRules(
    request,
    dependencies,
    dependencies.configuration.rulesInEvaluationOrder.filter((rule) => selected.has(rule.ruleId)),
    'a what-if evaluation',
  )
}

function evaluateOwnedRules(
  request: BranchEvaluationRequest,
  dependencies: Omit<BranchEvaluationDependencies, 'branches'>,
  owned: readonly RuleDefinition[],
  owner: string,
): BranchEvaluationResult {
  const { configuration } = dependencies
  const ownedIds = new Set(owned.map((rule) => rule.ruleId))
  const gates = new Map<string, HumanGateState>(
    request.humanGates.map((gate) => [gateKey(gate.ruleId, gate.entityId), gate]),
  )
  const gateRequests = new Map<string, HumanGateRequest>()

  const inputs: EvaluationInputs = {
    shipment: request.shipment,
    evidence: request.evidence,
    decisionTables: configuration.decisionTables,
    storedVersions: {
      caseRevision: request.caseRevision,
      entityVersions: request.shipment.entityVersions,
    },
    referenceData: dependencies.referenceData,
    policy: configuration.policy,
    semanticAnswerFor: (ruleId, entityId) =>
      request.semanticAnswers.find(
        (scripted) => scripted.ruleId === ruleId && scripted.entityId === entityId,
      )?.answer,
    humanGateStatus: (rule, subject) => {
      const status = gates.get(gateKey(rule.ruleId, subject.entityId))?.status
      if (status !== undefined && status !== 'UNKNOWN') return status
      gateRequests.set(gateKey(rule.ruleId, subject.entityId), {
        ruleId: rule.ruleId,
        entityId: subject.entityId,
      })
      return 'WAITING_HUMAN'
    },
    humanDecisionFor: (ruleId, entityId) => gates.get(gateKey(ruleId, entityId))?.decision,
    completedOperationFieldsFor: (ruleId, entityId) =>
      gates.get(gateKey(ruleId, entityId))?.completedFields,
    ensurePlanReservation: () => {
      if (!dependencies.ensurePlanReservation) {
        throw new Error(`${owner} does not own transport reservations`)
      }
      return dependencies.ensurePlanReservation(request)
    },
  }

  const graph = evaluateRuleGraph({
    rulesInEvaluationOrder: owned,
    upstreamRules: configuration.rulesInEvaluationOrder.filter(
      (rule) => !ownedIds.has(rule.ruleId),
    ),
    upstreamResults: request.upstreamResults,
    subjects: {
      cargoItem: request.shipment.cargoItems.map((item) => item.cargoItemId),
      leg: request.shipment.legs.map((leg) => leg.legId),
    },
    evaluateLeaf: (rule, subject) => evaluateLeafOrEscalate(rule, subject, inputs),
  })
  return { evaluations: graph.evaluations, humanGateRequests: [...gateRequests.values()] }
}

function evaluateLeafOrEscalate(
  rule: RuleDefinition,
  subject: CheckSubject,
  inputs: EvaluationInputs,
): LeafOutcome {
  const outcome = evaluateLeafRule(rule, subject, inputs)
  const escalates =
    outcome.gateStatus === 'UNKNOWN' &&
    rule.unknownPolicy === 'escalateToHuman' &&
    rule.evaluator.kind !== 'humanGate'
  if (!escalates) return outcome
  return {
    gateStatus: inputs.humanGateStatus(rule, subject),
    observedValue: {
      automated: outcome.observedValue ?? null,
      escalatedTo: rule.humanGate?.requiredRole,
    },
  }
}
