import { describe, expect, it } from 'vitest'
import { GateStatus, isPendingGateStatus, ObservabilityEvent, Shipment } from './index.js'

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

describe('observability events', () => {
  const base = {
    eventId: 'EV-1',
    timestamp: '2026-11-02T08:00:00.000Z',
    severity: 'info',
    service: 'coordinator',
    correlationId: 'corr-CASE-1',
    caseId: 'CASE-1',
  }

  it('accepts a business event and a span, and omits what does not apply', () => {
    expect(
      ObservabilityEvent.parse({ ...base, kind: 'event', eventName: 'case.submitted' }),
    ).toMatchObject({ kind: 'event' })
    expect(
      ObservabilityEvent.parse({
        ...base,
        kind: 'span',
        eventName: 'branch.evaluate',
        traceId: 'a'.repeat(32),
        spanId: 'b'.repeat(16),
        startedAt: base.timestamp,
        links: [{ traceId: 'c'.repeat(32), spanId: 'd'.repeat(16), relation: 'resumes' }],
      }),
    ).toMatchObject({ kind: 'span' })
  })

  it('refuses an unknown event name and a span without trace ids', () => {
    expect(() =>
      ObservabilityEvent.parse({ ...base, kind: 'event', eventName: 'made.up' }),
    ).toThrow()
    expect(() =>
      ObservabilityEvent.parse({
        ...base,
        kind: 'span',
        eventName: 'x',
        startedAt: base.timestamp,
      }),
    ).toThrow()
  })
})
