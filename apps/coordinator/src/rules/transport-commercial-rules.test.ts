import { describe, expect, it } from 'vitest'
import {
  baseShipment,
  evaluateWith,
  inputsFor,
  legSubject,
  order,
  withItems,
} from './leaf-inputs.fixture.js'

const firstLeg = legSubject('LOG-001-LEG-1')
const coldItem = {
  declaredCategories: ['COLD_CHAIN' as const],
  temperatureRange: { minDeciCelsius: 20, maxDeciCelsius: 80 },
}

function twoLegsVia(hubLocation: string) {
  const [leg] = baseShipment.legs as [(typeof baseShipment.legs)[number]]
  return {
    ...withItems([coldItem]),
    legs: [
      {
        ...leg,
        legId: 'LEG-1' as never,
        toLocation: hubLocation,
        plannedArrivalAt: '2026-11-03T05:00:00Z',
      },
      {
        ...leg,
        legId: 'LEG-2' as never,
        sequence: 2,
        fromLocation: hubLocation,
        plannedDepartureAt: '2026-11-03T05:45:00Z',
      },
    ],
  }
}

describe('R25 vehicle equipment', () => {
  it('fails a box truck for cold chain cargo', () => {
    expect(
      evaluateWith('vehicleFitsLeg', firstLeg, inputsFor(withItems([coldItem]))).gateStatus,
    ).toBe('FAIL')
  })
})

describe('R26 hub capability', () => {
  it('is not applicable on the final leg', () => {
    expect(evaluateWith('hubSupportsCargo', firstLeg, inputsFor(baseShipment)).gateStatus).toBe(
      'NOT_APPLICABLE',
    )
  })

  it('fails when the transfer hub cannot hold cold chain cargo', () => {
    const inputs = inputsFor(twoLegsVia('SZX-HUB'))
    expect(evaluateWith('hubSupportsCargo', legSubject('LEG-1'), inputs).gateStatus).toBe('FAIL')
  })

  it('passes through a hub that supports cold chain', () => {
    const inputs = inputsFor(twoLegsVia('SHA-HUB'))
    expect(evaluateWith('hubSupportsCargo', legSubject('LEG-1'), inputs).gateStatus).toBe('PASS')
  })
})

describe('R27 customer restrictions', () => {
  it('is not applicable without customer instructions', () => {
    const { customerInstructions: _, ...withoutInstructions } = baseShipment
    expect(
      evaluateWith('customerRestrictionsAllowRoute', order, inputsFor(withoutInstructions))
        .gateStatus,
    ).toBe('NOT_APPLICABLE')
  })
})

describe('R33 and R35 commercial thresholds', () => {
  const quoted = (amountCents: number, baselineAmountCents?: number) =>
    inputsFor({
      ...baseShipment,
      quote: {
        ...baseShipment.quote,
        amountCents,
        ...(baselineAmountCents === undefined ? {} : { baselineAmountCents }),
      },
    })

  it('accepts an excess within the approvable limit and rejects one beyond it', () => {
    expect(evaluateWith('creditExceptionWithinLimit', order, quoted(4_000_000)).gateStatus).toBe(
      'PASS',
    )
    expect(evaluateWith('creditExceptionWithinLimit', order, quoted(4_400_000)).gateStatus).toBe(
      'FAIL',
    )
  })

  it('requires extra cost approval only above the threshold', () => {
    expect(evaluateWith('extraCostApprovalRequired', order, quoted(180_000)).gateStatus).toBe(
      'NOT_APPLICABLE',
    )
    expect(
      evaluateWith('extraCostApprovalRequired', order, quoted(220_000, 180_000)).gateStatus,
    ).toBe('NOT_APPLICABLE')
    expect(
      evaluateWith('extraCostApprovalRequired', order, quoted(240_000, 180_000)).gateStatus,
    ).toBe('PASS')
  })
})
