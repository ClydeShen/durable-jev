import type { CaseRuntime, CaseStore, RulePack } from '@durable-jev/agent-core'
import { defineInvestigationTool, type InvestigationTool } from '@durable-jev/agent-harness'
import { Type } from '@earendil-works/pi-ai'
import type { CapacityOffer, ReferenceData } from '../reference-data.js'
import { applyRevision } from '../revision.js'
import type { Investigation, InvestigationStore, RerouteProposal } from './investigation-store.js'
import { type PlanCheck, planChecks, planPasses, reroutePatch } from './reroute-plan.js'

export interface RerouteToolDependencies {
  cases: CaseStore
  runtime: CaseRuntime
  rulePack: RulePack
  reference: ReferenceData
  investigations: InvestigationStore
  settle(investigation: Investigation): void
}

function shipmentOf(cases: CaseStore, caseId: string) {
  const record = cases.caseRecord(caseId)
  if (!record) throw new Error(`case ${caseId} does not exist`)
  return record.shipment
}

type OfferCheck = (
  investigation: Investigation,
  offerId: string,
) => Promise<{ offer?: CapacityOffer; checks: PlanCheck[] }>

/** Pre-checks an offer as the replacement for the incident leg with a what-if rule evaluation. */
function offerChecker({
  cases,
  runtime,
  reference,
  rulePack,
}: RerouteToolDependencies): OfferCheck {
  const titles = new Map(rulePack.ruleSet.rules.map((rule) => [rule.ruleId, rule.title]))
  return async (investigation, offerId) => {
    const offer = reference.capacityOffers.get(offerId)
    if (!offer) return { checks: [] }
    const shipment = shipmentOf(cases, investigation.caseId)
    const { legId } = investigation.incident
    const candidate = applyRevision(shipment, reroutePatch(shipment, legId, offer))
    return { offer, checks: planChecks(await runtime.whatIf(candidate), legId, titles) }
  }
}

function getCaseTool(dependencies: RerouteToolDependencies): InvestigationTool<Investigation> {
  const { cases, reference } = dependencies
  return defineInvestigationTool({
    name: 'get_case',
    description:
      'Read the shipment under investigation: the incident, legs, cargo needs, delivery window and quote.',
    parameters: Type.Object({}),
    execute: (_args, investigation: Investigation) => {
      const shipment = shipmentOf(cases, investigation.caseId)
      return {
        incident: investigation.incident,
        legs: shipment.legs.map((leg) => ({
          ...leg,
          carrierName: reference.carriers.get(leg.carrierId)?.name,
        })),
        cargo: shipment.cargoItems.map((item) => ({
          description: item.description,
          declaredCategories: item.declaredCategories,
          temperatureRange: item.temperatureRange,
          controlledClass: item.controlledClass,
          weightGrams: item.weightGrams,
        })),
        deliveryWindow: shipment.deliveryWindow,
        quote: shipment.quote,
      }
    },
  })
}

function searchOffersTool(dependencies: RerouteToolDependencies): InvestigationTool<Investigation> {
  const { cases, reference } = dependencies
  return defineInvestigationTool({
    name: 'search_capacity_offers',
    description:
      'List spare capacity offers on the same origin and destination as a leg, cheapest first, with carrier qualifications and vehicle capabilities.',
    parameters: Type.Object({ legId: Type.String() }),
    execute: (args, investigation: Investigation) => {
      const leg = shipmentOf(cases, investigation.caseId).legs.find(
        (candidate) => candidate.legId === args.legId,
      )
      if (!leg) return { error: `no leg ${args.legId}` }
      return [...reference.capacityOffers.values()]
        .filter(
          (offer) =>
            offer.origin === leg.origin &&
            offer.destination === leg.destination &&
            offer.carrierId !== leg.carrierId,
        )
        .sort((left, right) => left.priceCents - right.priceCents)
        .map((offer) => ({
          ...offer,
          carrier: reference.carriers.get(offer.carrierId),
          vehicle: reference.vehicles.get(offer.vehicleId),
        }))
    },
  })
}

function checkPlanTool(checkOffer: OfferCheck): InvestigationTool<Investigation> {
  return defineInvestigationTool({
    name: 'check_plan',
    description:
      'Pre-check an offer as the replacement for the incident leg against the rule engine. Only offers whose checks all pass may be proposed.',
    parameters: Type.Object({ offerId: Type.String() }),
    execute: async (args, investigation: Investigation) => {
      const { offer, checks } = await checkOffer(investigation, args.offerId)
      if (!offer) return { error: `no offer ${args.offerId}` }
      return { offerId: offer.offerId, passes: planPasses(checks), checks }
    },
  })
}

function submitResultTool(
  dependencies: RerouteToolDependencies,
  checkOffer: OfferCheck,
): InvestigationTool<Investigation> {
  const { cases } = dependencies
  return defineInvestigationTool({
    name: 'submit_investigation_result',
    description:
      'Submit the result once: propose one offer that passed check_plan, or escalate to the planner when none does. A planner still has to confirm any proposal.',
    parameters: Type.Object({
      decision: Type.Union([Type.Literal('propose'), Type.Literal('escalate')]),
      offerId: Type.Optional(Type.String()),
      rationale: Type.String(),
    }),
    execute: async (args, scope: Investigation) => {
      const investigation = dependencies.investigations.get(scope.investigationId) ?? scope
      if (investigation.status !== 'RUNNING') {
        return { recorded: false, status: investigation.status }
      }
      if (args.decision === 'escalate') {
        dependencies.settle({ ...investigation, status: 'ESCALATED', escalation: args.rationale })
        return { recorded: true, status: 'ESCALATED' }
      }
      const { offer, checks } = await checkOffer(investigation, args.offerId ?? '')
      if (!offer || !planPasses(checks)) {
        return { recorded: false, error: 'only an offer whose checks all pass can be proposed' }
      }
      const shipment = shipmentOf(cases, investigation.caseId)
      const proposal: RerouteProposal = {
        legId: investigation.incident.legId,
        offerId: offer.offerId,
        carrierId: offer.carrierId,
        vehicleId: offer.vehicleId,
        plannedDeparture: offer.plannedDeparture,
        plannedArrival: offer.plannedArrival,
        extraCostCents: Math.max(0, offer.priceCents - shipment.quote.amountCents),
        rationale: args.rationale,
        checks,
      }
      dependencies.settle({ ...investigation, status: 'PROPOSED', proposal })
      return { recorded: true, status: 'PROPOSED' }
    },
  })
}

export function rerouteTools(
  dependencies: RerouteToolDependencies,
): InvestigationTool<Investigation>[] {
  const checkOffer = offerChecker(dependencies)
  return [
    getCaseTool(dependencies),
    searchOffersTool(dependencies),
    checkPlanTool(checkOffer),
    submitResultTool(dependencies, checkOffer),
  ]
}
