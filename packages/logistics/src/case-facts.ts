import { createHash } from 'node:crypto'
import { type CargoItem, canonicalJson, type Leg, type Shipment } from '@durable-jev/contracts'
import type { CaseFacts, Facts } from '@durable-jev/rule-engine'
import type { ReferenceData } from './reference-data.js'
import { longestExcursionMinutes } from './temperature-log.js'

function itemFacts(shipment: Shipment, item: CargoItem): Facts {
  const { length, width, height } = item.dimensionsMillimetres
  const documents = shipment.documents.filter(
    (document) => document.cargoItemId === item.cargoItemId,
  )
  const records = shipment.warehouseRecords.find(
    (record) => record.cargoItemId === item.cargoItemId,
  )
  return {
    ...item,
    shipmentId: shipment.shipmentId,
    volumeCubicCm: Math.ceil((length * width * height * item.quantity) / 1000),
    documentKinds: documents.map((document) => document.kind),
    documentTexts: Object.fromEntries(documents.map((document) => [document.kind, document.text])),
    inspectionNote: records?.inspectionNote,
    sensor: records?.sensor,
    temperatureLog:
      records && item.temperatureRange
        ? {
            readings: records.temperatureReadings.length,
            longestExcursionMinutes: longestExcursionMinutes(
              records.temperatureReadings,
              item.temperatureRange,
            ),
          }
        : undefined,
  }
}

function legFacts(leg: Leg, reference: ReferenceData): Facts {
  const destination = reference.locations.get(leg.destination)
  return {
    ...leg,
    originRegion: reference.locations.get(leg.origin)?.region,
    destinationRegion: destination?.region,
    transferHub: destination?.hubId ? reference.hubs.get(destination.hubId) : null,
    carrier: reference.carriers.get(leg.carrierId),
    vehicle: reference.vehicles.get(leg.vehicleId),
  }
}

function documentsVersion(shipment: Shipment): string {
  return createHash('sha256')
    .update(
      canonicalJson({ documents: shipment.documents, warehouseRecords: shipment.warehouseRecords }),
    )
    .digest('hex')
    .slice(0, 12)
}

export function buildCaseFacts(shipment: Shipment, reference: ReferenceData): CaseFacts {
  const order = orderFacts(shipment, reference)
  const cargoItems = shipment.cargoItems.map((item) => {
    const facts = itemFacts(shipment, item)
    return {
      scope: { kind: 'cargoItem' as const, cargoItemId: item.cargoItemId },
      facts,
      context: { item: facts },
    }
  })
  const legs = shipment.legs.map((leg) => {
    const facts = legFacts(leg, reference)
    return { scope: { kind: 'leg' as const, legId: leg.legId }, facts, context: { leg: facts } }
  })
  return {
    entityVersions: { ...shipment.entityVersions, documents: documentsVersion(shipment) },
    root: { scope: { kind: 'order' }, facts: order },
    context: {
      order,
      cargoItems: cargoItems.map((item) => item.facts),
      legs: legs.map((leg) => leg.facts),
    },
    collections: { cargoItem: cargoItems, leg: legs },
    selection: { destinations: [shipment.destinationCountry], customers: [shipment.customerId] },
  }
}

function orderFacts(shipment: Shipment, reference: ReferenceData): Facts {
  return {
    caseId: shipment.caseId,
    shipmentId: shipment.shipmentId,
    customerId: shipment.customerId,
    customer: reference.customers.get(shipment.customerId),
    destinationCountry: shipment.destinationCountry,
    deliveryWindow: shipment.deliveryWindow,
    handover: shipment.handover,
    quote: shipment.quote,
    documents: shipment.documents,
  }
}
