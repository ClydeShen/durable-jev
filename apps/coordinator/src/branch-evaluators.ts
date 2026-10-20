import { A2aCallError, type A2aTaskLinks, a2aBranchEvaluator } from '@durable-jev/a2a-adapter'
import { BranchUnavailableError, httpBranchEvaluator } from '@durable-jev/branch-service'
import type {
  BranchEvaluationRequest,
  BranchEvaluationResult,
  ReferenceData,
  RuleBranch,
} from '@durable-jev/contracts'
import {
  evaluateBranchWithJudge,
  type JudgeFor,
  JudgeUnavailableError,
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
    judgeFor?: JudgeFor
  },
): BranchEvaluator {
  return {
    name,
    branches,
    evaluate: async (request) => {
      try {
        return await evaluateBranchWithJudge(request, { ...dependencies, branches })
      } catch (error) {
        // Same outcome as a service that is down: a technical state, never a pass.
        if (error instanceof JudgeUnavailableError)
          throw new BranchUnavailableError(name, error.message)
        throw error
      }
    },
  }
}

export function inProcessEvaluators(
  configuration: RuleConfiguration,
  referenceData: ReferenceData,
  reservationDatabase: StoreDatabase = openDatabase(':memory:', reservationMigrations),
  judgeFor?: JudgeFor,
): BranchEvaluator[] {
  const dependencies = { configuration, referenceData, ...(judgeFor && { judgeFor }) }
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

export type BranchProtocol = 'native' | 'a2a'

// The coordinator only sees BranchEvaluator: swapping the protocol changes nothing above it (H4).
function remoteEvaluator(
  name: string,
  branches: readonly RuleBranch[],
  url: string,
  protocol: BranchProtocol,
  links: A2aTaskLinks | undefined,
): BranchEvaluator {
  if (protocol === 'native') return httpBranchEvaluator(name, branches, url)
  if (!links) throw new Error('A2A delegation needs the A2A task links of the coordinator')
  const evaluator = a2aBranchEvaluator(name, branches, url, links)
  return {
    name,
    branches,
    evaluate: async (request) => {
      try {
        return await evaluator.evaluate(request)
      } catch (error) {
        if (error instanceof A2aCallError) throw new BranchUnavailableError(name, error.message)
        throw error
      }
    },
  }
}

export function serviceEvaluators(
  configuration: RuleConfiguration,
  referenceData: ReferenceData,
  urls: { cargoAssurance: string; transportPlanning: string; commercialControl: string },
  judgeFor?: JudgeFor,
  transport: { protocol: BranchProtocol; links?: A2aTaskLinks } = { protocol: 'native' },
): BranchEvaluator[] {
  const dependencies = { configuration, referenceData, ...(judgeFor && { judgeFor }) }
  const remote = (name: string, branches: readonly RuleBranch[], url: string) =>
    remoteEvaluator(name, branches, url, transport.protocol, transport.links)
  return [
    inProcessEvaluator('coordinator', ['base'], dependencies),
    remote('cargo-assurance', branchesByService.cargoAssurance, urls.cargoAssurance),
    remote('transport-planning', branchesByService.transportPlanning, urls.transportPlanning),
    remote('commercial-control', branchesByService.commercialControl, urls.commercialControl),
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
