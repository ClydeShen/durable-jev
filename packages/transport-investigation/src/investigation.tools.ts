import { defineTool, ToolRegistry } from '@durable-jev/agent-harness'
import type { ReferenceData } from '@durable-jev/contracts'
import type { RuleConfiguration } from '@durable-jev/rule-evaluation'
import { z } from 'zod'
import { Candidate, checkCandidate, type InvestigationCase } from './candidate-check.rules.js'

export type InvestigationRequest = {
  legId: string
  unavailableCarrierIds: readonly string[]
  reason: string
}

export const InvestigationProposal = z.discriminatedUnion('outcome', [
  Candidate.extend({ outcome: z.literal('REPLACEMENT'), rationale: z.string().min(1) }),
  z.object({
    outcome: z.literal('NO_CANDIDATE'),
    legId: z.string().min(1),
    rationale: z.string().min(1),
  }),
])
export type InvestigationProposal = z.infer<typeof InvestigationProposal>

export type InvestigationDependencies = {
  investigated: InvestigationCase
  request: InvestigationRequest
  configuration: RuleConfiguration
  referenceData: ReferenceData
}

export const resultToolName = 'submit_investigation_result'

// The agent may read and propose. Changing the plan stays with the transport planner.
export function investigationTools(dependencies: InvestigationDependencies): ToolRegistry {
  const { investigated, request, referenceData } = dependencies
  const legOf = (legId: string) => investigated.shipment.legs.find((leg) => leg.legId === legId)

  return new ToolRegistry()
    .register(
      defineTool({
        name: 'list_candidate_carriers',
        description:
          'List carriers that serve both ends of a leg, with their vehicles. Unavailable carriers are left out.',
        access: 'read',
        replayPolicy: 'replaySafe',
        allowedCallers: ['agent'],
        inputSchema: z.object({ legId: z.string() }),
        execute: async ({ legId }) => {
          const leg = legOf(legId)
          if (!leg) throw new Error(`${legId} is not a leg of this order`)
          return referenceData.carriers
            .filter((carrier) => !request.unavailableCarrierIds.includes(carrier.carrierId))
            .filter(
              (carrier) =>
                carrier.serviceLocations.includes(leg.fromLocation) &&
                carrier.serviceLocations.includes(leg.toLocation),
            )
            .map((carrier) => ({
              carrierId: carrier.carrierId,
              name: carrier.name,
              qualifications: carrier.qualifications.map((qualification) => qualification.category),
              vehicles: referenceData.vehicles
                .filter((vehicle) => vehicle.carrierId === carrier.carrierId)
                .map((vehicle) => ({
                  vehicleId: vehicle.vehicleId,
                  maxPayloadGrams: vehicle.maxPayloadGrams,
                  temperatureControl: vehicle.temperatureControl ?? null,
                })),
            }))
        },
      }),
    )
    .register(
      defineTool({
        name: 'check_candidate',
        description:
          'Re-run the capacity, qualification, temperature, service area and equipment rules with this carrier and vehicle on the leg.',
        access: 'read',
        replayPolicy: 'replaySafe',
        allowedCallers: ['agent'],
        inputSchema: Candidate,
        execute: async (candidate) => checkCandidate(investigated, candidate, dependencies),
      }),
    )
    .register(
      defineTool({
        name: resultToolName,
        description:
          'Submit a replacement proposal, or NO_CANDIDATE, for the transport planner to accept or reject.',
        access: 'write',
        replayPolicy: 'verifyByOperationId',
        allowedCallers: ['agent'],
        inputSchema: InvestigationProposal,
        execute: async (proposal) => {
          if (proposal.outcome === 'REPLACEMENT') {
            const check = checkCandidate(investigated, proposal, dependencies)
            if (!check.fits)
              throw new Error(`the candidate does not fit: ${check.problems.join('; ')}`)
          }
          return proposal
        },
      }),
    )
}
