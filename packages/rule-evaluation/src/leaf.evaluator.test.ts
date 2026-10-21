import { readFileSync } from 'node:fs'
import type { CheckSubject, ReferenceData, Shipment } from '@durable-jev/contracts'
import type { RuleDefinition } from '@durable-jev/rule-engine'
import { describe, expect, it } from 'vitest'
import type { EvaluationInputs } from './evaluation-inputs.types.js'
import { evaluateLeafRule } from './leaf.evaluator.js'

const materials = new URL('../../../eval/materials/', import.meta.url)
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, materials), 'utf8'))
const logOne = readJson('cases/LOG-001.json')
const referenceData: ReferenceData = readJson('mock-data/reference-data.json')
const policy = readJson('mock-policy-parameters.json')
const rules: RuleDefinition[] = readJson('rules.json').rules
const ruleById = (ruleId: string) => rules.find((rule) => rule.ruleId === ruleId) as RuleDefinition

const inputsFor = (
  shipment: Shipment,
  overrides: Partial<EvaluationInputs> = {},
): EvaluationInputs => {
  return {
    shipment,
    evidence: { documents: [], temperatureLogs: [], inspectionNotes: [] },
    decisionTables: { mixingMatrix: readJson('decision-tables/mixing-matrix.json') },
    storedVersions: {
      caseRevision: shipment.caseRevision,
      entityVersions: shipment.entityVersions,
    },
    referenceData,
    policy,
    semanticAnswerFor: (ruleId, entityId) =>
      logOne.scriptedSemanticAnswers.find(
        (scripted: { ruleId: string; entityId: string }) =>
          scripted.ruleId === ruleId && scripted.entityId === entityId,
      )?.answer,
    humanGateStatus: () => 'WAITING_HUMAN',
    humanDecisionFor: () => undefined,
    completedOperationFieldsFor: () => undefined,
    ensurePlanReservation: () => true,
    ...overrides,
  }
}

const order: CheckSubject = { scope: 'order', entityId: 'order' }
const firstItem: CheckSubject = { scope: 'cargoItem', entityId: 'LOG-001-ITEM-1' }
const firstLeg: CheckSubject = { scope: 'leg', entityId: 'LOG-001-LEG-1' }
const statusOf = (ruleId: string, subject: CheckSubject, inputs = inputsFor(logOne.shipment)) =>
  evaluateLeafRule(ruleById(ruleId), subject, inputs).gateStatus

describe('LOG-001 leaf rules', () => {
  it.each([
    ['R01', order],
    ['R02', firstItem],
    ['R03', firstItem],
    ['R04', firstItem],
    ['R05', firstItem],
    ['R06', order],
    ['R07', order],
    ['R08', order],
    ['R24', firstLeg],
    ['R25', firstLeg],
    ['R29', order],
    ['R31', order],
    ['R32', order],
  ])('%s passes for the complete general cargo order', (ruleId, subject) => {
    expect(statusOf(ruleId, subject)).toBe('PASS')
  })
})

describe('leaf rule boundaries', () => {
  const shipment: Shipment = logOne.shipment
  const withLeg = (changes: Partial<Shipment['legs'][number]>) => ({
    ...shipment,
    legs: shipment.legs.map((leg) => ({ ...leg, ...changes })),
  })

  it('R05 fails when the van cannot carry the total weight', () => {
    const smallVan = withLeg({ vehicleId: 'VEH-NL-VAN-1T' as never })
    const heavy = {
      ...smallVan,
      cargoItems: smallVan.cargoItems.map((item) => ({ ...item, weightGrams: 600_000 })),
    }
    expect(statusOf('R05', firstItem, inputsFor(heavy))).toBe('FAIL')
  })

  it('R06 fails when arrival is after the delivery window', () => {
    const late = withLeg({ plannedArrivalAt: '2026-11-03T12:30:00Z' })
    expect(statusOf('R06', order, inputsFor(late))).toBe('FAIL')
  })

  it('R03 is UNKNOWN when the semantic answer is ambiguous or missing', () => {
    const ambiguous = inputsFor(shipment, {
      semanticAnswerFor: () => ({ type: 'noul', noul: 0.5 }),
    })
    expect(statusOf('R03', firstItem, ambiguous)).toBe('UNKNOWN')
    const missing = inputsFor(shipment, { semanticAnswerFor: () => undefined })
    expect(statusOf('R03', firstItem, missing)).toBe('UNKNOWN')
  })

  it('R03 sends a reading near either line to a person, whichever side it falls', () => {
    const statusFor = (noul: number) =>
      statusOf(
        'R03',
        firstItem,
        inputsFor(shipment, { semanticAnswerFor: () => ({ type: 'noul', noul }) }),
      )
    expect(statusFor(0.97)).toBe('PASS')
    expect(statusFor(0.85)).toBe('PASS')
    expect(statusFor(0.81)).toBe('UNKNOWN')
    expect(statusFor(0.8)).toBe('UNKNOWN')
    expect(statusFor(0.76)).toBe('UNKNOWN')
    expect(statusFor(0.21)).toBe('UNKNOWN')
    expect(statusFor(0.2)).toBe('UNKNOWN')
    expect(statusFor(0.15)).toBe('FAIL')
    expect(statusFor(0.05)).toBe('FAIL')
  })

  it('R08 fails when evaluating a stale revision', () => {
    const stale = inputsFor(shipment, {
      storedVersions: { caseRevision: 2, entityVersions: shipment.entityVersions },
    })
    expect(statusOf('R08', order, stale)).toBe('FAIL')
  })

  it('R24 fails when the carrier does not serve the destination', () => {
    const elsewhere = { ...withLeg({ toLocation: 'CAN-CLINIC' }), destination: 'CAN-CLINIC' }
    expect(statusOf('R24', firstLeg, inputsFor(elsewhere))).toBe('FAIL')
  })

  it('R32 fails when the quote exceeds remaining credit', () => {
    const expensive = { ...shipment, quote: { ...shipment.quote, amountCents: 4_000_000 } }
    expect(statusOf('R32', order, inputsFor(expensive))).toBe('FAIL')
  })

  it('human gates delegate to the human task state', () => {
    expect(statusOf('R39-LOAD', order)).toBe('WAITING_HUMAN')
  })
})
