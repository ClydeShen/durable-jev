import type {
  CaseEvidence,
  GateStatus,
  ReferenceData,
  RuleEvaluationRecord,
  Shipment,
} from '@durable-jev/contracts'
import { evaluateSelectedRules, type RuleConfiguration } from '@durable-jev/rule-evaluation'
import { z } from 'zod'

export type InvestigationCase = {
  caseId: string
  caseRevision: number
  shipment: Shipment
  evidence: CaseEvidence
  // Current results; everything the candidate does not touch is taken as it is now.
  checks: readonly RuleEvaluationRecord[]
}

export const Candidate = z.object({
  legId: z.string().min(1),
  carrierId: z.string().min(1),
  vehicleId: z.string().min(1),
})
export type Candidate = z.infer<typeof Candidate>

// The rules a carrier or vehicle swap can change: capacity, controlled-goods qualification,
// temperature range, service area, equipment fit and hub capability.
export const carrierFitRuleIds = ['R05', 'R11', 'R16', 'R24', 'R25', 'R26'] as const

export type CandidateCheck = {
  fits: boolean
  results: { ruleId: string; entityId: string; gateStatus: GateStatus }[]
  problems: string[]
}

const settled = new Set<GateStatus>(['PASS', 'NOT_APPLICABLE'])

export function checkCandidate(
  investigated: InvestigationCase,
  candidate: Candidate,
  dependencies: { configuration: RuleConfiguration; referenceData: ReferenceData },
): CandidateCheck {
  const vehicle = dependencies.referenceData.vehicles.find(
    (known) => known.vehicleId === candidate.vehicleId,
  )
  if (vehicle?.carrierId !== candidate.carrierId) {
    return {
      fits: false,
      results: [],
      problems: [`${candidate.vehicleId} is not a vehicle of ${candidate.carrierId}`],
    }
  }
  if (!investigated.shipment.legs.some((leg) => leg.legId === candidate.legId)) {
    return { fits: false, results: [], problems: [`${candidate.legId} is not a leg of this order`] }
  }
  const shipment = {
    ...investigated.shipment,
    legs: investigated.shipment.legs.map((leg) =>
      leg.legId === candidate.legId
        ? { ...leg, carrierId: candidate.carrierId, vehicleId: candidate.vehicleId }
        : leg,
    ),
  } as Shipment
  const whatIf = evaluateSelectedRules(
    {
      caseId: investigated.shipment.caseId,
      caseRevision: investigated.caseRevision,
      shipment,
      evidence: investigated.evidence,
      semanticAnswers: [],
      upstreamResults: [...investigated.checks],
      humanGates: [],
    },
    { ...dependencies, ruleIds: carrierFitRuleIds },
  )
  const results = whatIf.evaluations.map((evaluation) => ({
    ruleId: evaluation.ruleId as string,
    entityId: evaluation.subject.entityId,
    gateStatus: evaluation.gateStatus,
  }))
  const problems = results
    .filter((result) => !settled.has(result.gateStatus))
    .map((result) => `${result.ruleId} ${result.gateStatus} for ${result.entityId}`)
  return { fits: problems.length === 0, results, problems }
}
