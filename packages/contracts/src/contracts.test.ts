import { describe, expect, it } from 'vitest'
import { GateStatus, isPendingGateStatus, Shipment } from './index.js'

const validShipment = {
  caseId: 'CASE-001',
  shipmentId: 'LOG-001',
  customerId: 'CUST-01',
  caseRevision: 1,
  entityVersions: { cargo: 1, route: 1, carrier: 1, quote: 1 },
  origin: 'Warehouse A',
  destination: 'Clinic B',
  deliveryWindow: { earliestAt: '2026-11-01T08:00:00Z', latestAt: '2026-11-01T12:00:00Z' },
  cargoItems: [
    {
      cargoItemId: 'ITEM-1',
      description: 'Vaccines, 40 vials',
      declaredCategories: ['COLD_CHAIN'],
      weightGrams: 12_000,
      lengthMm: 400,
      widthMm: 300,
      heightMm: 300,
      temperatureRange: { minDeciCelsius: 20, maxDeciCelsius: 80 },
    },
  ],
  legs: [],
  quote: { quoteId: 'Q-1', amountCents: 125_000, currency: 'EUR' },
}

describe('Shipment', () => {
  it('accepts a valid shipment', () => {
    expect(Shipment.safeParse(validShipment).success).toBe(true)
  })

  it('rejects more than three legs', () => {
    const leg = {
      legId: 'L',
      sequence: 1,
      fromLocation: 'A',
      toLocation: 'B',
      carrierId: 'C',
      vehicleId: 'V',
      plannedDepartureAt: '2026-11-01T06:00:00Z',
      plannedArrivalAt: '2026-11-01T07:00:00Z',
    }
    const result = Shipment.safeParse({ ...validShipment, legs: [leg, leg, leg, leg] })
    expect(result.success).toBe(false)
  })

  it('rejects fractional grams', () => {
    const [item] = validShipment.cargoItems
    const result = Shipment.safeParse({
      ...validShipment,
      cargoItems: [{ ...item, weightGrams: 12.5 }],
    })
    expect(result.success).toBe(false)
  })
})

describe('GateStatus', () => {
  it('treats only waiting states as pending', () => {
    const pending = GateStatus.options.filter(isPendingGateStatus)
    expect(pending).toEqual(['UNKNOWN', 'BLOCKED_DEPENDENCY', 'WAITING_HUMAN', 'INVALIDATED'])
  })
})
