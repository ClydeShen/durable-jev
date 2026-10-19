import { describe, expect, it } from 'vitest'
import { listCaseIds, loadCase, loadReferenceData } from './materials.js'

const referenceData = loadReferenceData()

describe.each(listCaseIds())('case %s', (caseName) => {
  const caseFile = loadCase(caseName)
  const { shipment } = caseFile

  it('references a known customer', () => {
    const customerIds = referenceData.customers.map((customer) => customer.customerId)
    expect(customerIds).toContain(shipment.customerId)
  })

  it('uses vehicles that belong to the leg carrier and carriers that serve the leg', () => {
    for (const leg of shipment.legs) {
      const vehicle = referenceData.vehicles.find((known) => known.vehicleId === leg.vehicleId)
      const carrier = referenceData.carriers.find((known) => known.carrierId === leg.carrierId)
      expect(vehicle?.carrierId).toBe(leg.carrierId)
      expect(carrier?.serviceLocations).toEqual(
        expect.arrayContaining([leg.fromLocation, leg.toLocation]),
      )
    }
  })

  it('scripts semantic answers only for existing cargo items', () => {
    const cargoItemIds = shipment.cargoItems.map((item) => item.cargoItemId as string)
    for (const scripted of caseFile.scriptedSemanticAnswers) {
      expect(cargoItemIds).toContain(scripted.entityId)
    }
  })
})
