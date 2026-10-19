import type { TemperatureLog } from '@durable-jev/contracts'
import { describe, expect, it } from 'vitest'
import { longestExcursionMinutes } from './cold-chain-rules.js'
import {
  baseShipment,
  evaluateWith,
  inputsFor,
  itemSubject,
  withItems,
} from './leaf-inputs.fixture.js'

const vaccines = {
  declaredCategories: ['COLD_CHAIN' as const],
  temperatureRange: { minDeciCelsius: 20, maxDeciCelsius: 80 },
}
const item = itemSubject('ITEM-1')
const departureAt = baseShipment.legs[0]?.plannedDepartureAt as string

function logWith(
  readings: [string, number][],
  calibrationValidUntil = '2027-01-01T00:00:00Z',
): TemperatureLog {
  return {
    cargoItemId: 'ITEM-1' as never,
    sensorId: 'SENSOR-1',
    calibrationValidUntil,
    readings: readings.map(([at, deciCelsius]) => ({ at, deciCelsius })),
  }
}

const steadyLog = logWith([
  ['2026-11-03T02:00:00Z', 45],
  ['2026-11-03T03:00:00Z', 50],
])

describe('R16 vehicle temperature coverage', () => {
  it('fails on a vehicle without temperature control', () => {
    expect(
      evaluateWith('vehicleCoversTemperatureRange', item, inputsFor(withItems([vaccines])))
        .gateStatus,
    ).toBe('FAIL')
  })

  it('passes on a reefer that covers the range', () => {
    const shipment = {
      ...withItems([vaccines]),
      legs: baseShipment.legs.map((leg) => ({ ...leg, vehicleId: 'VEH-PL-REEFER-5T' as never })),
    }
    expect(
      evaluateWith('vehicleCoversTemperatureRange', item, inputsFor(shipment)).gateStatus,
    ).toBe('PASS')
  })
})

describe('R17 sensor record', () => {
  it('passes with a calibrated sensor read shortly before departure', () => {
    const inputs = inputsFor(withItems([vaccines]), { evidence: { temperatureLogs: [steadyLog] } })
    expect(evaluateWith('sensorRecordValid', item, inputs).gateStatus).toBe('PASS')
  })

  it('fails when the last reading is older than the policy allows', () => {
    const stale = logWith([['2026-11-02T20:00:00Z', 45]])
    const inputs = inputsFor(withItems([vaccines]), { evidence: { temperatureLogs: [stale] } })
    expect(evaluateWith('sensorRecordValid', item, inputs).gateStatus).toBe('FAIL')
  })

  it('fails when calibration lapses before departure', () => {
    const uncalibrated = logWith([['2026-11-03T03:00:00Z', 45]], '2026-11-01T00:00:00Z')
    const inputs = inputsFor(withItems([vaccines]), {
      evidence: { temperatureLogs: [uncalibrated] },
    })
    expect(evaluateWith('sensorRecordValid', item, inputs).gateStatus).toBe('FAIL')
  })

  it('is UNKNOWN without any temperature log', () => {
    expect(
      evaluateWith('sensorRecordValid', item, inputsFor(withItems([vaccines]))).gateStatus,
    ).toBe('UNKNOWN')
    expect(departureAt).toBe('2026-11-03T04:00:00Z')
  })
})

describe('R19 excursion', () => {
  const range = vaccines.temperatureRange

  it('measures the longest continuous stretch outside the range', () => {
    const log = logWith([
      ['2026-11-03T00:00:00Z', 50],
      ['2026-11-03T00:10:00Z', 95],
      ['2026-11-03T00:40:00Z', 99],
      ['2026-11-03T00:55:00Z', 60],
      ['2026-11-03T01:00:00Z', 90],
      ['2026-11-03T01:05:00Z', 60],
    ])
    expect(longestExcursionMinutes(log, range)).toBe(45)
  })

  it('records the fact without failing, and raises the excursion condition beyond tolerance', () => {
    const log = logWith([
      ['2026-11-03T00:00:00Z', 95],
      ['2026-11-03T00:45:00Z', 50],
    ])
    const inputs = inputsFor(withItems([vaccines]), { evidence: { temperatureLogs: [log] } })
    expect(evaluateWith('temperatureExcursionChecked', item, inputs)).toMatchObject({
      gateStatus: 'PASS',
      observedValue: { longestExcursionMinutes: 45, exceedsTolerance: true },
    })
    expect(evaluateWith('excursionBeyondTolerance', item, inputs).gateStatus).toBe('PASS')
  })

  it('leaves the excursion condition not applicable within tolerance', () => {
    const inputs = inputsFor(withItems([vaccines]), { evidence: { temperatureLogs: [steadyLog] } })
    expect(evaluateWith('excursionBeyondTolerance', item, inputs).gateStatus).toBe('NOT_APPLICABLE')
  })
})

describe('R18 inspection risk', () => {
  const note = {
    cargoItemId: 'ITEM-1' as never,
    inspectedAt: '2026-11-03T01:00:00Z',
    note: 'Carton crushed',
  }
  const answer = (choice: string, probability: number) => ({
    'R18@ITEM-1': { type: 'choice' as const, choice, probabilities: { [choice]: probability } },
  })

  it('reports a confident risk as a fact and raises the risk condition', () => {
    const inputs = inputsFor(withItems([vaccines]), {
      evidence: { inspectionNotes: [note] },
      answers: answer('damaged_packaging', 0.85),
    })
    expect(evaluateWith('inspectionRiskAssessed', item, inputs).gateStatus).toBe('PASS')
    expect(evaluateWith('riskSignalPresent', item, inputs).gateStatus).toBe('PASS')
  })

  it('is UNKNOWN when the answer is not confident, so it can be escalated', () => {
    const inputs = inputsFor(withItems([vaccines]), {
      evidence: { inspectionNotes: [note] },
      answers: answer('damaged_packaging', 0.5),
    })
    expect(evaluateWith('inspectionRiskAssessed', item, inputs).gateStatus).toBe('UNKNOWN')
  })

  it('uses the quality review when the automated answer was uncertain', () => {
    const inputs = inputsFor(withItems([vaccines]), {
      evidence: { inspectionNotes: [note] },
      answers: answer('damaged_packaging', 0.5),
      humanDecisionFor: () => ({
        outcome: 'APPROVED',
        decidedBy: 'QUALITY_REVIEWER',
        decidedAt: '2026-11-03T01:30:00Z',
        conditions: ['REWORK_REQUIRED'],
      }),
    })
    expect(evaluateWith('riskSignalPresent', item, inputs).gateStatus).toBe('PASS')
  })
})

describe('R22 retest', () => {
  const withRetest = (reading: string) =>
    inputsFor(withItems([vaccines]), {
      completedOperationFieldsFor: () => ({ retestReadingDeciCelsius: reading, retestBy: 'op' }),
    })

  it('passes when the captured reading is inside the range', () => {
    expect(evaluateWith('retestWithinRange', item, withRetest('55')).gateStatus).toBe('PASS')
  })

  it('fails when the captured reading is outside the range', () => {
    expect(evaluateWith('retestWithinRange', item, withRetest('95')).gateStatus).toBe('FAIL')
  })

  it('is UNKNOWN before the reading has been captured', () => {
    expect(
      evaluateWith('retestWithinRange', item, inputsFor(withItems([vaccines]))).gateStatus,
    ).toBe('UNKNOWN')
  })
})
