import type { PlanChange, Role, Shipment } from '@durable-jev/contracts'
import { CoordinatorError } from './coordinator.errors.js'

export const roleForChange: Record<PlanChange['kind'], Role> = {
  reassignVehicle: 'TRANSPORT_PLANNER',
  changeCarrier: 'TRANSPORT_PLANNER',
  changeQuote: 'COMMERCIAL_MANAGER',
  replaceLegs: 'TRANSPORT_PLANNER',
  recordPackaging: 'WAREHOUSE_OPERATOR',
}

export type AppliedPlanChange = { shipment: Shipment; triggers: string[] }

function withLeg(shipment: Shipment, legId: string, update: Partial<Shipment['legs'][number]>) {
  if (!shipment.legs.some((leg) => leg.legId === legId)) {
    throw new CoordinatorError(
      'UNPROCESSABLE',
      `leg ${legId} is not part of ${shipment.shipmentId}`,
    )
  }
  return shipment.legs.map((leg) => (leg.legId === legId ? { ...leg, ...update } : leg))
}

export function applyPlanChange(shipment: Shipment, change: PlanChange): AppliedPlanChange {
  const versions = shipment.entityVersions
  const nextRevision = shipment.caseRevision + 1
  switch (change.kind) {
    case 'reassignVehicle':
      return {
        triggers: ['vehicle'],
        shipment: {
          ...shipment,
          caseRevision: nextRevision,
          entityVersions: { ...versions, route: versions.route + 1 },
          legs: withLeg(shipment, change.legId, { vehicleId: change.vehicleId }),
        },
      }
    case 'changeCarrier':
      return {
        triggers: ['carrier', 'vehicle'],
        shipment: {
          ...shipment,
          caseRevision: nextRevision,
          entityVersions: { ...versions, carrier: versions.carrier + 1, route: versions.route + 1 },
          legs: withLeg(shipment, change.legId, {
            carrierId: change.carrierId,
            vehicleId: change.vehicleId,
          }),
        },
      }
    case 'changeQuote':
      return {
        triggers: ['quote'],
        shipment: {
          ...shipment,
          caseRevision: nextRevision,
          entityVersions: { ...versions, quote: versions.quote + 1 },
          quote: {
            ...shipment.quote,
            baselineAmountCents: shipment.quote.baselineAmountCents ?? shipment.quote.amountCents,
            amountCents: change.amountCents,
          },
        },
      }
    case 'replaceLegs':
      return {
        triggers: ['route', 'carrier', 'vehicle'],
        shipment: {
          ...shipment,
          caseRevision: nextRevision,
          entityVersions: { ...versions, route: versions.route + 1, carrier: versions.carrier + 1 },
          legs: change.legs,
        },
      }
    case 'recordPackaging':
      if (!shipment.cargoItems.some((item) => item.cargoItemId === change.cargoItemId)) {
        throw new CoordinatorError(
          'UNPROCESSABLE',
          `cargo item ${change.cargoItemId} is not part of ${shipment.shipmentId}`,
        )
      }
      return {
        triggers: ['cargo'],
        shipment: {
          ...shipment,
          caseRevision: nextRevision,
          entityVersions: { ...versions, cargo: versions.cargo + 1 },
          cargoItems: shipment.cargoItems.map((item) =>
            item.cargoItemId === change.cargoItemId
              ? { ...item, packagingId: change.packagingId }
              : item,
          ),
        },
      }
  }
}
