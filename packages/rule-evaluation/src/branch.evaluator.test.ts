import type { BranchEvaluationRequest, RuleEvaluationRecord } from '@durable-jev/contracts'
import { describe, expect, it } from 'vitest'
import {
  evaluateBranch,
  evaluateSelectedRules,
  requiredUpstreamRuleIds,
} from './branch.evaluator.js'
import { buildRuleConfiguration } from './configuration.config.js'
import { baseShipment, logOne, readMaterial, referenceData } from './leaf-inputs.fixture.js'

const configuration = buildRuleConfiguration(
  readMaterial('rules.json'),
  readMaterial('mock-policy-parameters.json'),
  {
    mixingMatrix: readMaterial('decision-tables/mixing-matrix.json'),
    semanticQuestions: readMaterial('semantic-questions.json'),
  },
)

const request = (
  upstreamResults: RuleEvaluationRecord[],
  humanGates: BranchEvaluationRequest['humanGates'],
  overrides: Partial<BranchEvaluationRequest> = {},
): BranchEvaluationRequest => {
  return {
    caseId: baseShipment.caseId,
    caseRevision: baseShipment.caseRevision,
    shipment: baseShipment,
    evidence: { documents: [], temperatureLogs: [], inspectionNotes: [] },
    semanticAnswers: logOne.scriptedSemanticAnswers,
    upstreamResults,
    humanGates,
    ...overrides,
  }
}

const baseEvaluation = evaluateBranch(request([], []), {
  configuration,
  referenceData,
  branches: ['base'],
})
const cargoEvaluation = evaluateBranch(request(baseEvaluation.evaluations, []), {
  configuration,
  referenceData,
  branches: ['controlled', 'coldChain'],
})
const beforePlan = [...baseEvaluation.evaluations, ...cargoEvaluation.evaluations]

const statusOf = (evaluations: RuleEvaluationRecord[], ruleId: string) =>
  evaluations.find((evaluation) => evaluation.ruleId === ruleId)?.gateStatus

describe('evaluateBranch', () => {
  it('evaluates only the rules of its branches', () => {
    const ruleIds = new Set(baseEvaluation.evaluations.map((evaluation) => evaluation.ruleId))
    expect(ruleIds.has('R01')).toBe(true)
    expect(ruleIds.has('R31')).toBe(false)
  })

  it('stays blocked when an upstream branch has not been evaluated yet', () => {
    const plan = evaluateBranch(request(baseEvaluation.evaluations, []), {
      configuration,
      referenceData,
      branches: ['plan'],
      ensurePlanReservation: () => true,
    })
    expect(statusOf(plan.evaluations, 'R29')).toBe('BLOCKED_DEPENDENCY')
  })

  it('builds on upstream results from other evaluators', () => {
    let reservations = 0
    const plan = evaluateBranch(request(beforePlan, []), {
      configuration,
      referenceData,
      branches: ['plan'],
      ensurePlanReservation: () => {
        reservations += 1
        return true
      },
    })
    expect(statusOf(plan.evaluations, 'R30')).toBe('PASS')
    expect(reservations).toBe(1)
  })

  it('asks for a human gate it reaches without a valid task and treats it as waiting', () => {
    const overCredit = { ...baseShipment, quote: { ...baseShipment.quote, amountCents: 4_000_000 } }
    const commercial = evaluateBranch(
      request(baseEvaluation.evaluations, [], { shipment: overCredit }),
      {
        configuration,
        referenceData,
        branches: ['commercial'],
      },
    )
    expect(statusOf(commercial.evaluations, 'R34')).toBe('WAITING_HUMAN')
    expect(statusOf(commercial.evaluations, 'R36')).toBe('BLOCKED_DEPENDENCY')
    expect(commercial.humanGateRequests).toEqual([{ ruleId: 'R34', entityId: 'order' }])
  })

  it('uses the human gate state it is given', () => {
    const overCredit = { ...baseShipment, quote: { ...baseShipment.quote, amountCents: 4_000_000 } }
    const commercial = evaluateBranch(
      request(
        baseEvaluation.evaluations,
        [{ ruleId: 'R34' as never, entityId: 'order', status: 'PASS' }],
        {
          shipment: overCredit,
        },
      ),
      { configuration, referenceData, branches: ['commercial'] },
    )
    expect(statusOf(commercial.evaluations, 'R36')).toBe('PASS')
    expect(commercial.humanGateRequests).toEqual([])
  })

  it('refuses to reserve transport from a service that does not own reservations', () => {
    expect(() =>
      evaluateBranch(request(beforePlan, []), {
        configuration,
        referenceData,
        branches: ['plan'],
      }),
    ).toThrow('does not own transport reservations')
  })
})

describe('requiredUpstreamRuleIds', () => {
  it('lists rules a branch reads from other branches', () => {
    const upstream = requiredUpstreamRuleIds(configuration.rulesInEvaluationOrder, ['plan'])
    expect(upstream).toEqual(expect.arrayContaining(['R05', 'R16', 'R11']))
    expect(upstream).not.toContain('R24')
  })
})

describe('evaluateSelectedRules', () => {
  it('re-checks only the selected rules against a changed plan', () => {
    const [leg] = baseShipment.legs
    const shipment = {
      ...baseShipment,
      legs: [{ ...leg, carrierId: 'CAR-SECURA', vehicleId: 'VEH-SC-REEFER-3T' }],
    } as typeof baseShipment
    const whatIf = evaluateSelectedRules(request(beforePlan, [], { shipment }), {
      configuration,
      referenceData,
      ruleIds: ['R24', 'R25'],
    })
    expect(new Set(whatIf.evaluations.map((evaluation) => evaluation.ruleId))).toEqual(
      new Set(['R24', 'R25']),
    )
    expect(statusOf(whatIf.evaluations, 'R24')).toBe('FAIL')
  })
})
