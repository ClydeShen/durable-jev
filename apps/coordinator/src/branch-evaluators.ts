import type {
  BranchEvaluationRequest,
  BranchEvaluationResult,
  ReferenceData,
  RuleBranch,
} from '@durable-jev/contracts'
import {
  evaluateBranch,
  type RuleConfiguration,
  requiredUpstreamRuleIds,
  rulesOfBranches,
} from '@durable-jev/rule-evaluation'
import { openDatabase, type StoreDatabase } from '@durable-jev/store'
import { ensurePlanReservation, reservationMigrations } from '@durable-jev/transport-reservations'

export type BranchEvaluator = {
  name: string
  branches: readonly RuleBranch[]
  evaluate(request: BranchEvaluationRequest): Promise<BranchEvaluationResult>
}

export const branchesByService = {
  cargoAssurance: ['controlled', 'coldChain'],
  transportPlanning: ['plan'],
  commercialControl: ['commercial'],
} as const satisfies Record<string, readonly RuleBranch[]>

export function inProcessEvaluator(
  name: string,
  branches: readonly RuleBranch[],
  dependencies: {
    configuration: RuleConfiguration
    referenceData: ReferenceData
    ensurePlanReservation?: (request: BranchEvaluationRequest) => boolean
  },
): BranchEvaluator {
  return {
    name,
    branches,
    evaluate: async (request) => evaluateBranch(request, { ...dependencies, branches }),
  }
}

export function inProcessEvaluators(
  configuration: RuleConfiguration,
  referenceData: ReferenceData,
  reservationDatabase: StoreDatabase = openDatabase(':memory:', reservationMigrations),
): BranchEvaluator[] {
  const dependencies = { configuration, referenceData }
  return [
    inProcessEvaluator('coordinator', ['base'], dependencies),
    inProcessEvaluator('cargo-assurance', branchesByService.cargoAssurance, dependencies),
    inProcessEvaluator('transport-planning', branchesByService.transportPlanning, {
      ...dependencies,
      ensurePlanReservation: (request) =>
        ensurePlanReservation(reservationDatabase, request.shipment),
    }),
    inProcessEvaluator('commercial-control', branchesByService.commercialControl, dependencies),
    inProcessEvaluator('coordinator', ['release'], dependencies),
  ]
}

export function assertEvaluationOrder(
  evaluators: readonly BranchEvaluator[],
  configuration: RuleConfiguration,
): void {
  const rules = configuration.rulesInEvaluationOrder
  const evaluatedRuleIds = new Set<string>()
  const coveredBranches = new Set<RuleBranch>()
  for (const evaluator of evaluators) {
    const duplicated = evaluator.branches.filter((branch) => coveredBranches.has(branch))
    if (duplicated.length > 0) {
      throw new Error(`${evaluator.name} evaluates ${duplicated.join(', ')} a second time`)
    }
    const missing = requiredUpstreamRuleIds(rules, evaluator.branches).filter(
      (ruleId) => !evaluatedRuleIds.has(ruleId),
    )
    if (missing.length > 0) {
      throw new Error(`${evaluator.name} needs ${missing.join(', ')} evaluated before it`)
    }
    for (const branch of evaluator.branches) coveredBranches.add(branch)
    for (const rule of rulesOfBranches(rules, evaluator.branches)) evaluatedRuleIds.add(rule.ruleId)
  }
  const uncovered = rules.filter((rule) => !rule.branch || !coveredBranches.has(rule.branch))
  if (uncovered.length > 0) {
    throw new Error(`no evaluator covers ${uncovered.map((rule) => rule.ruleId).join(', ')}`)
  }
}
