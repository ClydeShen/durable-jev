import { httpBranchEvaluator } from '@durable-jev/branch-service'
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

export function serviceEvaluators(
  configuration: RuleConfiguration,
  referenceData: ReferenceData,
  urls: { cargoAssurance: string; transportPlanning: string; commercialControl: string },
): BranchEvaluator[] {
  const dependencies = { configuration, referenceData }
  return [
    inProcessEvaluator('coordinator', ['base'], dependencies),
    httpBranchEvaluator('cargo-assurance', branchesByService.cargoAssurance, urls.cargoAssurance),
    httpBranchEvaluator(
      'transport-planning',
      branchesByService.transportPlanning,
      urls.transportPlanning,
    ),
    httpBranchEvaluator(
      'commercial-control',
      branchesByService.commercialControl,
      urls.commercialControl,
    ),
    inProcessEvaluator('coordinator', ['release'], dependencies),
  ]
}

export function planEvaluationLayers(
  evaluators: readonly BranchEvaluator[],
  configuration: RuleConfiguration,
): BranchEvaluator[][] {
  const rules = configuration.rulesInEvaluationOrder
  const ownerOfRule = new Map<string, BranchEvaluator>()
  for (const evaluator of evaluators) {
    for (const rule of rulesOfBranches(rules, evaluator.branches)) {
      const existing = ownerOfRule.get(rule.ruleId)
      if (existing) {
        throw new Error(`${evaluator.name} and ${existing.name} both evaluate ${rule.ruleId}`)
      }
      ownerOfRule.set(rule.ruleId, evaluator)
    }
  }
  const uncovered = rules.filter((rule) => !ownerOfRule.has(rule.ruleId))
  if (uncovered.length > 0) {
    throw new Error(`no evaluator covers ${uncovered.map((rule) => rule.ruleId).join(', ')}`)
  }

  const prerequisitesOf = new Map(
    evaluators.map((evaluator) => [
      evaluator,
      new Set(
        requiredUpstreamRuleIds(rules, evaluator.branches).map(
          (ruleId) => ownerOfRule.get(ruleId) as BranchEvaluator,
        ),
      ),
    ]),
  )
  const layers: BranchEvaluator[][] = []
  const scheduled = new Set<BranchEvaluator>()
  while (scheduled.size < evaluators.length) {
    const ready = evaluators.filter(
      (evaluator) =>
        !scheduled.has(evaluator) &&
        [...(prerequisitesOf.get(evaluator) ?? [])].every((prerequisite) =>
          scheduled.has(prerequisite),
        ),
    )
    if (ready.length === 0) {
      const waiting = evaluators.filter((evaluator) => !scheduled.has(evaluator))
      throw new Error(
        `evaluators depend on each other: ${waiting.map((evaluator) => evaluator.name).join(', ')}`,
      )
    }
    layers.push(ready)
    for (const evaluator of ready) scheduled.add(evaluator)
  }
  return layers
}
