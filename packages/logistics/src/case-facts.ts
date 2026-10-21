import type { CargoItem, Leg, Shipment } from '@durable-jev/contracts'
import type { CaseFacts, Facts } from '@durable-jev/rule-engine'
import type { ReferenceData } from './reference-data.js'

function itemFacts(shipment: Shipment, item: CargoItem): Facts {
  const { length, width, height } = item.dimensionsMillimetres
  return {
    ...item,
    shipmentId: shipment.shipmentId,
    volumeCubicCm: Math.ceil((length * width * height * item.quantity) / 1000),
  }
}

function legFacts(leg: Leg, reference: ReferenceData): Facts {
  return {
    ...leg,
    originRegion: reference.locations.get(leg.origin)?.region,
    destinationRegion: reference.locations.get(leg.destination)?.region,
    transferHubId: reference.locations.get(leg.destination)?.hubId,
    carrier: reference.carriers.get(leg.carrierId),
    vehicle: reference.vehicles.get(leg.vehicleId),
  }
}

export function buildCaseFacts(shipment: Shipment, reference: ReferenceData): CaseFacts {
  return {
    entityVersions: { ...shipment.entityVersions, documents: shipment.caseRevision },
    order: {
      caseId: shipment.caseId,
      shipmentId: shipment.shipmentId,
      customerId: shipment.customerId,
      customer: reference.customers.get(shipment.customerId),
      deliveryWindow: shipment.deliveryWindow,
      handover: shipment.handover,
      quote: shipment.quote,
      documents: shipment.documents,
    },
    cargoItems: shipment.cargoItems.map((item) => ({
      cargoItemId: item.cargoItemId,
      facts: itemFacts(shipment, item),
    })),
    legs: shipment.legs.map((leg) => ({ legId: leg.legId, facts: legFacts(leg, reference) })),
  }
}
