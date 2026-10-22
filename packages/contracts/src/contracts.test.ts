import { describe, expect, it } from 'vitest'
import { humanTaskSchema } from './human-task.js'
import { shipmentSchema } from './shipment.js'
import { isPendingCheckStatus } from './statuses.js'

const entityVersions = { cargo: 1, route: 1, carrier: 1, quote: 1 }

function leg(sequence: number) {
  return {
    legId: `LEG-${sequence}`,
    sequence,
    origin: 'Warehouse A',
    destination: 'Hub B',
    carrierId: 'CAR-1',
    vehicleId: 'VEH-1',
    plannedDeparture: '2026-11-02T08:00:00Z',
    plannedArrival: '2026-11-02T12:00:00Z',
  }
}

const shipment = {
  caseId: 'LOG-001',
  correlationId: 'corr-LOG-001',
  shipmentId: 'SHP-001',
  customerId: 'CUS-1',
  destinationCountry: 'NZ',
  caseRevision: 1,
  entityVersions,
  cargoItems: [
    {
      cargoItemId: 'ITEM-1',
      description: 'Office chairs, flat packed',
      declaredCategories: ['general'],
      quantity: 20,
      weightGrams: 180_000,
      dimensionsMillimetres: { length: 1200, width: 800, height: 1000 },
    },
  ],
  legs: [leg(1)],
  deliveryWindow: { from: '2026-11-02T10:00:00Z', to: '2026-11-02T18:00:00Z' },
  handover: 'dock',
  quote: { amountCents: 120_000, extraCostCents: 0, currency: 'EUR' },
  documents: [],
  warehouseRecords: [],
}

const approvalTask = {
  humanTaskId: 'HT-1',
  caseId: 'LOG-001',
  ruleId: 'R13',
  scope: { kind: 'cargoItem', cargoItemId: 'ITEM-1' },
  taskType: 'APPROVAL',
  requiredRole: 'complianceReviewer',
  prerequisites: ['R10', 'R11', 'R12'],
  evidenceRequirements: [],
  target: { caseRevision: 1, entityVersions, inputFingerprint: 'fp-1' },
  status: 'OPEN',
  createdAt: '2026-11-01T08:00:00Z',
  expiresAt: '2026-11-01T20:00:00Z',
}

const decision = {
  outcome: 'APPROVED',
  decidedByRole: 'complianceReviewer',
  decidedBy: 'demo-compliance',
  decidedAt: '2026-11-01T09:00:00Z',
}

describe('shipmentSchema', () => {
  it('accepts a complete order', () => {
    expect(shipmentSchema.safeParse(shipment).success).toBe(true)
  })

  it('allows at most three legs in sequence order', () => {
    const fourLegs = { ...shipment, legs: [leg(1), leg(2), leg(3), leg(4)] }
    expect(shipmentSchema.safeParse(fourLegs).success).toBe(false)
    expect(shipmentSchema.safeParse({ ...shipment, legs: [leg(2)] }).success).toBe(false)
  })

  it('keeps weights in integer grams', () => {
    const [item] = shipment.cargoItems
    const fractional = { ...shipment, cargoItems: [{ ...item, weightGrams: 180.5 }] }
    expect(shipmentSchema.safeParse(fractional).success).toBe(false)
  })
})

describe('humanTaskSchema', () => {
  it('requires a matching decision to be approved', () => {
    expect(humanTaskSchema.safeParse(approvalTask).success).toBe(true)
    expect(humanTaskSchema.safeParse({ ...approvalTask, status: 'APPROVED' }).success).toBe(false)
    expect(
      humanTaskSchema.safeParse({ ...approvalTask, status: 'APPROVED', decision }).success,
    ).toBe(true)
    expect(
      humanTaskSchema.safeParse({ ...approvalTask, status: 'REJECTED', decision }).success,
    ).toBe(false)
  })

  it('does not let an approval stand in for an operation', () => {
    const operation = { ...approvalTask, ruleId: 'R21', taskType: 'OPERATION' }
    expect(humanTaskSchema.safeParse({ ...operation, status: 'APPROVED', decision }).success).toBe(
      false,
    )
  })

  it('links superseded tasks to their replacement', () => {
    expect(humanTaskSchema.safeParse({ ...approvalTask, status: 'SUPERSEDED' }).success).toBe(false)
    const superseded = { ...approvalTask, status: 'SUPERSEDED', supersededBy: 'HT-2' }
    expect(humanTaskSchema.safeParse(superseded).success).toBe(true)
  })
})

describe('approval chains', () => {
  const step = {
    chainId: 'LOG-001:R34',
    mode: 'sequential',
    distinctActors: true,
    stepIndex: 1,
    stepCount: 2,
  }

  it('places an approval at a step of its chain', () => {
    expect(humanTaskSchema.safeParse({ ...approvalTask, approvalChain: step }).success).toBe(true)
    const outOfRange = { ...approvalTask, approvalChain: { ...step, stepIndex: 2 } }
    expect(humanTaskSchema.safeParse(outOfRange).success).toBe(false)
  })

  it('keeps operations out of approval chains', () => {
    const operation = { ...approvalTask, taskType: 'OPERATION', approvalChain: step }
    expect(humanTaskSchema.safeParse(operation).success).toBe(false)
  })
})

describe('isPendingCheckStatus', () => {
  it('treats waiting and unknown states as pending, never terminal', () => {
    expect(isPendingCheckStatus('UNKNOWN')).toBe(true)
    expect(isPendingCheckStatus('WAITING_HUMAN')).toBe(true)
    expect(isPendingCheckStatus('PASS')).toBe(false)
    expect(isPendingCheckStatus('NOT_APPLICABLE')).toBe(false)
  })
})
