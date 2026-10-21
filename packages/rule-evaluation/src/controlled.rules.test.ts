import { describe, expect, it } from 'vitest'
import {
  baseShipment,
  evaluateWith,
  inputsFor,
  itemSubject,
  order,
  withItems,
} from './leaf-inputs.fixture.js'

const controlledItem = {
  declaredCategories: ['CONTROLLED' as const],
  controlledClass: 'CLASS-A',
}

describe('condition rules', () => {
  it('mark branch conditions PASS when they hold and NOT_APPLICABLE otherwise', () => {
    const shipment = withItems([controlledItem, { declaredCategories: ['GENERAL'] }])
    const inputs = inputsFor(shipment)
    expect(
      evaluateWith('itemRequiresControlledHandling', itemSubject('ITEM-1'), inputs).gateStatus,
    ).toBe('PASS')
    expect(
      evaluateWith('itemRequiresControlledHandling', itemSubject('ITEM-2'), inputs).gateStatus,
    ).toBe('NOT_APPLICABLE')
    expect(evaluateWith('itemRequiresColdChain', itemSubject('ITEM-2'), inputs).gateStatus).toBe(
      'NOT_APPLICABLE',
    )
  })
})

describe('R09 controlled documents', () => {
  it('fails and lists what is missing', () => {
    const inputs = inputsFor(withItems([controlledItem]), {
      evidence: {
        documents: [
          {
            documentId: 'D1',
            kind: 'SAFETY_DATA_SHEET',
            cargoItemId: 'ITEM-1' as never,
            text: 'SDS',
            extractedFields: {},
          },
        ],
      },
    })
    expect(evaluateWith('controlledDocumentsComplete', itemSubject('ITEM-1'), inputs)).toEqual({
      gateStatus: 'FAIL',
      observedValue: { missing: ['CONTROLLED_DECLARATION'] },
    })
  })
})

describe('R11 carrier qualification', () => {
  it('fails when the carrier has no controlled qualification', () => {
    const inputs = inputsFor(withItems([controlledItem]))
    expect(
      evaluateWith('carrierQualifiedForControlled', itemSubject('ITEM-1'), inputs).gateStatus,
    ).toBe('FAIL')
  })

  it('fails when the qualification expires before arrival', () => {
    const shipment = {
      ...withItems([controlledItem]),
      legs: baseShipment.legs.map((leg) => ({
        ...leg,
        carrierId: 'CAR-SECURA' as never,
        vehicleId: 'VEH-SC-REEFER-3T' as never,
        plannedDepartureAt: '2027-01-02T04:00:00Z',
        plannedArrivalAt: '2027-01-02T07:30:00Z',
      })),
    }
    expect(
      evaluateWith('carrierQualifiedForControlled', itemSubject('ITEM-1'), inputsFor(shipment))
        .gateStatus,
    ).toBe('FAIL')
  })

  it('passes with a carrier qualified through arrival', () => {
    const shipment = {
      ...withItems([controlledItem]),
      legs: baseShipment.legs.map((leg) => ({ ...leg, carrierId: 'CAR-SECURA' as never })),
    }
    expect(
      evaluateWith('carrierQualifiedForControlled', itemSubject('ITEM-1'), inputsFor(shipment))
        .gateStatus,
    ).toBe('PASS')
  })
})

describe('R12 mixing matrix', () => {
  it('forbids oxidisers with cold chain goods in one shipment', () => {
    const shipment = withItems([controlledItem, { declaredCategories: ['COLD_CHAIN'] }])
    const result = evaluateWith('mixedLoadAllowed', order, inputsFor(shipment))
    expect(result.gateStatus).toBe('FAIL')
    expect(result.observedValue).toMatchObject({
      conflicts: [expect.stringContaining('Oxidisers')],
    })
  })

  it('allows a single controlled class with general goods', () => {
    const shipment = withItems([controlledItem, { declaredCategories: ['GENERAL'] }])
    expect(evaluateWith('mixedLoadAllowed', order, inputsFor(shipment)).gateStatus).toBe('PASS')
  })
})
