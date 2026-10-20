import { readFileSync } from 'node:fs'
import type { CaseEvidence, GateStatus, ReferenceData, Shipment } from '@durable-jev/contracts'
import { buildRuleConfiguration } from '@durable-jev/rule-evaluation'
import { openDatabase } from '@durable-jev/store'
import { describe, expect, it } from 'vitest'
import { inProcessEvaluators } from './branch-evaluators.js'
import { type CaseView, CoordinatorService } from './coordinator-service.js'
import { coordinatorMigrations } from './persistence/coordinator-migrations.js'

const materials = new URL('../../../eval/materials/', import.meta.url)
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, materials), 'utf8'))
const logOne = readJson('cases/LOG-001.json')
const baseShipment: Shipment = logOne.shipment

function startCoordinator() {
  const configuration = buildRuleConfiguration(
    readJson('rules.json'),
    readJson('mock-policy-parameters.json'),
    { mixingMatrix: readJson('decision-tables/mixing-matrix.json') },
  )
  return new CoordinatorService({
    database: openDatabase(':memory:', coordinatorMigrations),
    configuration,
    evaluators: inProcessEvaluators(
      configuration,
      readJson('mock-data/reference-data.json') as ReferenceData,
    ),
    now: () => '2026-11-02T08:00:00.000Z',
  })
}

const gate = (view: CaseView, ruleId: string, entityId = 'order'): GateStatus | undefined =>
  view.checks.find((check) => check.ruleId === ruleId && check.subject.entityId === entityId)
    ?.gateStatus
const openTask = (view: CaseView, ruleId: string) =>
  view.humanTasks.find((task) => task.ruleId === ruleId && task.status === 'OPEN')

describe('cold chain rework chain', () => {
  const itemId = 'COLD-ITEM-1'
  const shipment: Shipment = {
    ...baseShipment,
    caseId: 'CASE-COLD' as never,
    shipmentId: 'COLD-1' as never,
    cargoItems: [
      {
        cargoItemId: itemId as never,
        description: 'Vaccines, 40 vials in insulated shipper',
        declaredCategories: ['COLD_CHAIN'],
        weightGrams: 12_000,
        lengthMm: 600,
        widthMm: 400,
        heightMm: 400,
        temperatureRange: { minDeciCelsius: 20, maxDeciCelsius: 80 },
      },
    ],
    legs: baseShipment.legs.map((leg) => ({
      ...leg,
      carrierId: 'CAR-POLAR' as never,
      vehicleId: 'VEH-PL-REEFER-5T' as never,
    })),
  }
  const evidence: CaseEvidence = {
    documents: [],
    temperatureLogs: [
      {
        cargoItemId: itemId as never,
        sensorId: 'SENSOR-7',
        calibrationValidUntil: '2027-01-01T00:00:00Z',
        readings: [
          { at: '2026-11-03T02:00:00Z', deciCelsius: 45 },
          { at: '2026-11-03T03:30:00Z', deciCelsius: 50 },
        ],
      },
    ],
    inspectionNotes: [
      {
        cargoItemId: itemId as never,
        inspectedAt: '2026-11-03T03:00:00Z',
        note: 'Outer carton crushed on one corner.',
      },
    ],
  }
  const answers = [
    { ruleId: 'R03', entityId: itemId, answer: { type: 'noul' as const, noul: 0.95 } },
    { ruleId: 'R27', entityId: 'order', answer: { type: 'noul' as const, noul: 0.93 } },
    {
      ruleId: 'R18',
      entityId: itemId,
      answer: {
        type: 'choice' as const,
        choice: 'damaged_packaging',
        probabilities: { no_risk: 0, damaged_packaging: 0.85, cold_chain_risk: 0.15 },
      },
    },
  ]

  it('requires repack, then retest, before loading can start', async () => {
    const coordinator = startCoordinator()
    let view = await coordinator.submitCase({
      shipment,
      evidence,
      scriptedSemanticAnswers: answers,
    })

    expect(gate(view, 'R18', itemId)).toBe('PASS')
    expect(gate(view, 'R18-RISK', itemId)).toBe('PASS')
    expect(gate(view, 'R20', itemId)).toBe('NOT_APPLICABLE')
    expect(gate(view, 'R21', itemId)).toBe('WAITING_HUMAN')
    expect(gate(view, 'R22-CAPTURE', itemId)).toBe('BLOCKED_DEPENDENCY')
    expect(gate(view, 'R23', itemId)).toBe('BLOCKED_DEPENDENCY')
    expect(openTask(view, 'R22-CAPTURE')).toBeUndefined()
    expect(openTask(view, 'R39-LOAD')).toBeUndefined()

    await coordinator.completeHumanTask(
      openTask(view, 'R21')?.humanTaskId ?? '',
      'WAREHOUSE_OPERATOR',
      {
        repackPhotoRef: 'PHOTO-1',
        packagingId: 'PKG-2',
      },
    )
    view = coordinator.getCase(shipment.caseId)
    expect(gate(view, 'R21', itemId)).toBe('PASS')
    expect(gate(view, 'R22-CAPTURE', itemId)).toBe('WAITING_HUMAN')
    expect(openTask(view, 'R39-LOAD')).toBeUndefined()

    await coordinator.completeHumanTask(
      openTask(view, 'R22-CAPTURE')?.humanTaskId ?? '',
      'WAREHOUSE_OPERATOR',
      {
        retestReadingDeciCelsius: '48',
        retestBy: 'op-3',
      },
    )
    view = coordinator.getCase(shipment.caseId)
    expect(gate(view, 'R22', itemId)).toBe('PASS')
    expect(gate(view, 'R23', itemId)).toBe('PASS')
    expect(gate(view, 'R38')).toBe('PASS')
    expect(openTask(view, 'R39-LOAD')).toBeDefined()
  })

  it('holds the cargo when the retest reading is out of range', async () => {
    const coordinator = startCoordinator()
    let view = await coordinator.submitCase({
      shipment,
      evidence,
      scriptedSemanticAnswers: answers,
    })
    await coordinator.completeHumanTask(
      openTask(view, 'R21')?.humanTaskId ?? '',
      'WAREHOUSE_OPERATOR',
      {
        repackPhotoRef: 'PHOTO-1',
        packagingId: 'PKG-2',
      },
    )
    view = coordinator.getCase(shipment.caseId)
    await coordinator.completeHumanTask(
      openTask(view, 'R22-CAPTURE')?.humanTaskId ?? '',
      'WAREHOUSE_OPERATOR',
      {
        retestReadingDeciCelsius: '95',
        retestBy: 'op-3',
      },
    )
    view = coordinator.getCase(shipment.caseId)
    expect(gate(view, 'R22', itemId)).toBe('FAIL')
    expect(gate(view, 'R23', itemId)).toBe('FAIL')
    expect(view.orderStatus).toBe('ON_HOLD')
    expect(openTask(view, 'R39-LOAD')).toBeUndefined()
  })
})

describe('commercial credit exception', () => {
  const overCredit: Shipment = {
    ...baseShipment,
    caseId: 'CASE-CREDIT' as never,
    shipmentId: 'CREDIT-1' as never,
    quote: { ...baseShipment.quote, amountCents: 4_000_000 },
  }

  it('waits on the commercial manager and only then lets loading start', async () => {
    const coordinator = startCoordinator()
    let view = await coordinator.submitCase({
      shipment: overCredit,
      scriptedSemanticAnswers: logOne.scriptedSemanticAnswers,
    })
    expect(gate(view, 'R32')).toBe('FAIL')
    expect(gate(view, 'R33')).toBe('PASS')
    expect(gate(view, 'R34')).toBe('WAITING_HUMAN')
    expect(gate(view, 'R36')).toBe('BLOCKED_DEPENDENCY')
    expect(openTask(view, 'R39-LOAD')).toBeUndefined()

    await coordinator.approveHumanTask(
      openTask(view, 'R34')?.humanTaskId ?? '',
      'COMMERCIAL_MANAGER',
    )
    view = coordinator.getCase(overCredit.caseId)
    expect(gate(view, 'R36')).toBe('PASS')
    expect(openTask(view, 'R39-LOAD')).toBeDefined()
  })

  it('fails without offering an approval when the excess is beyond the approvable limit', async () => {
    const coordinator = startCoordinator()
    const view = await coordinator.submitCase({
      shipment: { ...overCredit, quote: { ...overCredit.quote, amountCents: 4_400_000 } },
      scriptedSemanticAnswers: logOne.scriptedSemanticAnswers,
    })
    expect(gate(view, 'R33')).toBe('FAIL')
    expect(gate(view, 'R34')).toBe('BLOCKED_DEPENDENCY')
    expect(openTask(view, 'R34')).toBeUndefined()
    expect(gate(view, 'R36')).toBe('FAIL')
    expect(view.orderStatus).toBe('ON_HOLD')
  })
})
