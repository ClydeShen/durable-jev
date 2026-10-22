import type { Shipment } from '@durable-jev/contracts'
import { type RuleOutcome, scopeKey } from '@durable-jev/rule-engine'
import type { CapacityOffer } from '../reference-data.js'

/** The rules a replacement leg must pass before a planner sees it. */
const planRules = new Set(['R05', 'R06', 'R07', 'R11', 'R16', 'R24', 'R25', 'R26'])

export interface PlanCheck {
  ruleId: string
  title: string
  scope: string
  status: RuleOutcome['status']
}

export function planChecks(
  outcomes: readonly RuleOutcome[],
  legId: string,
  titles: ReadonlyMap<string, string>,
): PlanCheck[] {
  return outcomes
    .filter(
      (outcome) =>
        planRules.has(outcome.ruleId) &&
        (outcome.scope.kind === 'order' ||
          (outcome.scope.kind === 'leg' && outcome.scope.legId === legId)),
    )
    .map((outcome) => ({
      ruleId: outcome.ruleId,
      title: titles.get(outcome.ruleId) ?? outcome.ruleId,
      scope: scopeKey(outcome.scope),
      status: outcome.status,
    }))
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId))
}

export const planPasses = (checks: readonly PlanCheck[]) =>
  checks.every((check) => check.status === 'PASS' || check.status === 'NOT_APPLICABLE')

/** The revision that moves a leg onto an offer; extra cost is what the offer adds to the quote. */
export function reroutePatch(shipment: Shipment, legId: string, offer: CapacityOffer) {
  const versions = shipment.entityVersions
  return {
    caseRevision: shipment.caseRevision + 1,
    entityVersions: {
      route: versions.route + 1,
      carrier: versions.carrier + 1,
      quote: versions.quote + 1,
    },
    legs: shipment.legs.map((leg) =>
      leg.legId === legId
        ? {
            ...leg,
            carrierId: offer.carrierId,
            vehicleId: offer.vehicleId,
            plannedDeparture: offer.plannedDeparture,
            plannedArrival: offer.plannedArrival,
          }
        : leg,
    ),
    quote: {
      ...shipment.quote,
      extraCostCents: Math.max(0, offer.priceCents - shipment.quote.amountCents),
    },
  }
}
