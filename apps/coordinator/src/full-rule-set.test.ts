import { readFileSync } from 'node:fs'
import type { CaseEvidence, GateStatus, ReferenceData, Shipment } from '@durable-jev/contracts'
import { buildRuleConfiguration } from '@durable-jev/rule-evaluation'
import { openDatabase } from '@durable-jev/store'
import { describe, expect, it } from 'vitest'
import { inProcessEvaluators } from './branch.evaluator.js'
import { type CaseView, CoordinatorService } from './coordinator.service.js'
import { coordinatorMigrations } from './persistence/coordinator.migrations.js'

const materials = new URL('../../../eval/materials/', import.meta.url)
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, materials), 'utf8'))
const logOne = readJson('cases/LOG-001.json')
const baseShipment: Shipment = logOne.shipment

const startCoordinator = () => {
  const configuration = buildRuleConfiguration(
    readJson('rules.json'),
    readJson('mock-policy-parameters.json'),
    {
      mixingMatrix: readJson('decision-tables/mixing-matrix.json'),
      semanticQuestions: readJson('semantic-questions.json'),
    },
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

describe('branches progress independently while waiting on people', () => {
  const itemId = 'CTRL-ITEM-1'
  const controlledOverCredit: Shipment = {
    ...baseShipment,
    caseId: 'CASE-PARALLEL' as never,
    shipmentId: 'PARALLEL-1' as never,
    destination: 'NKG-DC3',
    cargoItems: [
      {
        cargoItemId: itemId as never,
        description: 'Lithium ion battery packs for medical carts, 20 units',
        declaredCategories: ['CONTROLLED'],
        controlledClass: 'CLASS-9',
        weightGrams: 80_000,
        lengthMm: 1200,
        widthMm: 800,
        heightMm: 900,
      },
    ],
    legs: baseShipment.legs.map((leg) => ({
      ...leg,
      toLocation: 'NKG-DC3',
      carrierId: 'CAR-SECURA' as never,
      vehicleId: 'VEH-SC-REEFER-3T' as never,
    })),
    quote: { ...baseShipment.quote, amountCents: 4_000_000 },
  }
  const evidence: CaseEvidence = {
    documents: [
      {
        documentId: 'SDS-1',
        kind: 'SAFETY_DATA_SHEET',
        cargoItemId: itemId as never,
        text: 'Lithium ion batteries, UN3480, class 9.',
        extractedFields: {},
      },
      {
        documentId: 'DECL-1',
        kind: 'CONTROLLED_DECLARATION',
        cargoItemId: itemId as never,
        text: 'Declared: lithium ion battery packs, class 9.',
        extractedFields: {},
      },
    ],
    temperatureLogs: [],
    inspectionNotes: [],
  }
  const answers = [
    { ruleId: 'R03', entityId: itemId, answer: { type: 'noul' as const, noul: 0.94 } },
    { ruleId: 'R10', entityId: itemId, answer: { type: 'noul' as const, noul: 0.92 } },
    { ruleId: 'R27', entityId: 'order', answer: { type: 'noul' as const, noul: 0.93 } },
  ]

  it('completes the commercial branch while compliance sign-off is still pending', async () => {
    const coordinator = startCoordinator()
    let view = await coordinator.submitCase({
      shipment: controlledOverCredit,
      evidence,
      scriptedSemanticAnswers: answers,
    })
    expect(openTask(view, 'R13')?.requiredRole).toBe('COMPLIANCE_REVIEWER')
    expect(openTask(view, 'R34')?.requiredRole).toBe('COMMERCIAL_MANAGER')

    await coordinator.approveHumanTask(
      openTask(view, 'R34')?.humanTaskId ?? '',
      'COMMERCIAL_MANAGER',
    )
    view = coordinator.getCase(controlledOverCredit.caseId)
    expect(gate(view, 'R36')).toBe('PASS')
    expect(gate(view, 'R13')).toBe('WAITING_HUMAN')
    expect(gate(view, 'R14', itemId)).toBe('BLOCKED_DEPENDENCY')
    expect(openTask(view, 'R39-LOAD')).toBeUndefined()

    await coordinator.approveHumanTask(
      openTask(view, 'R13')?.humanTaskId ?? '',
      'COMPLIANCE_REVIEWER',
    )
    view = coordinator.getCase(controlledOverCredit.caseId)
    expect(gate(view, 'R14', itemId)).toBe('PASS')
    expect(openTask(view, 'R39-LOAD')).toBeDefined()
  })
})

describe('plan changes', () => {
  const tasksFor = (view: CaseView, ruleId: string) =>
    view.humanTasks.filter((task) => task.ruleId === ruleId)
  const checkOf = (view: CaseView, ruleId: string) =>
    view.checks.find((check) => check.ruleId === ruleId && check.subject.entityId !== 'never')

  it('re-checks only what a vehicle change affects and supersedes the loading task', async () => {
    const coordinator = startCoordinator()
    const before = await coordinator.submitCase({
      shipment: baseShipment,
      scriptedSemanticAnswers: logOne.scriptedSemanticAnswers,
    })
    const oldLoadTask = openTask(before, 'R39-LOAD')
    const legId = baseShipment.legs[0]?.legId as string

    const after = await coordinator.applyChange(
      baseShipment.caseId,
      { kind: 'reassignVehicle', legId: legId as never, vehicleId: 'VEH-NL-VAN-1T' as never },
      'TRANSPORT_PLANNER',
    )

    const [change] = after.changes
    expect(change).toMatchObject({ fromRevision: 1, toRevision: 2, triggers: ['vehicle'] })
    expect(change?.invalidatedRuleIds).toEqual(
      expect.arrayContaining(['R05', 'R25', 'R29', 'R30', 'R40']),
    )
    expect(change?.invalidatedRuleIds).not.toContain('R31')
    expect(change?.invalidatedRuleIds).not.toContain('R32')
    expect(checkOf(after, 'R25')?.affectedByChange).toBe(change?.changeId)
    expect(checkOf(after, 'R31')?.affectedByChange).toBeUndefined()
    expect(after.orderStatus).toBe('AWAITING_HUMAN')
    expect(
      tasksFor(after, 'R39-LOAD').find((task) => task.humanTaskId === oldLoadTask?.humanTaskId),
    ).toMatchObject({
      status: 'SUPERSEDED',
      supersededBy: openTask(after, 'R39-LOAD')?.humanTaskId,
    })
  })

  describe('on a controlled, over-credit order', () => {
    const itemId = 'CTRL-ITEM-1'
    const shipment: Shipment = {
      ...baseShipment,
      caseId: 'CASE-CHANGES' as never,
      shipmentId: 'CHANGES-1' as never,
      destination: 'NKG-DC3',
      cargoItems: [
        {
          cargoItemId: itemId as never,
          description: 'Lithium ion battery packs for medical carts, 20 units',
          declaredCategories: ['CONTROLLED'],
          controlledClass: 'CLASS-9',
          weightGrams: 80_000,
          lengthMm: 1200,
          widthMm: 800,
          heightMm: 900,
        },
      ],
      legs: baseShipment.legs.map((leg) => ({
        ...leg,
        toLocation: 'NKG-DC3',
        carrierId: 'CAR-SECURA' as never,
        vehicleId: 'VEH-SC-REEFER-3T' as never,
      })),
      quote: { ...baseShipment.quote, amountCents: 4_000_000 },
    }
    const evidence: CaseEvidence = {
      documents: [
        {
          documentId: 'SDS-1',
          kind: 'SAFETY_DATA_SHEET',
          cargoItemId: itemId as never,
          text: 'UN3480 class 9',
          extractedFields: {},
        },
        {
          documentId: 'DECL-1',
          kind: 'CONTROLLED_DECLARATION',
          cargoItemId: itemId as never,
          text: 'Class 9 batteries',
          extractedFields: {},
        },
      ],
      temperatureLogs: [],
      inspectionNotes: [],
    }
    const answers = [
      { ruleId: 'R03', entityId: itemId, answer: { type: 'noul' as const, noul: 0.94 } },
      { ruleId: 'R10', entityId: itemId, answer: { type: 'noul' as const, noul: 0.92 } },
      { ruleId: 'R27', entityId: 'order', answer: { type: 'noul' as const, noul: 0.93 } },
    ]

    const withBothApprovals = async () => {
      const coordinator = startCoordinator()
      const view = await coordinator.submitCase({
        shipment,
        evidence,
        scriptedSemanticAnswers: answers,
      })
      await coordinator.approveHumanTask(
        openTask(view, 'R13')?.humanTaskId ?? '',
        'COMPLIANCE_REVIEWER',
      )
      await coordinator.approveHumanTask(
        openTask(view, 'R34')?.humanTaskId ?? '',
        'COMMERCIAL_MANAGER',
      )
      return coordinator
    }

    it('keeps the compliance sign-off but re-asks for the credit exception when the quote changes', async () => {
      const coordinator = await withBothApprovals()
      const view = await coordinator.applyChange(
        shipment.caseId,
        { kind: 'changeQuote', amountCents: 4_100_000 },
        'COMMERCIAL_MANAGER',
      )
      expect(gate(view, 'R13')).toBe('PASS')
      expect(gate(view, 'R34')).toBe('WAITING_HUMAN')
      expect(tasksFor(view, 'R34').map((task) => task.status)).toEqual(['SUPERSEDED', 'OPEN'])
    })

    it('voids the compliance sign-off when the carrier changes', async () => {
      const coordinator = await withBothApprovals()
      const legId = shipment.legs[0]?.legId as string
      const view = await coordinator.applyChange(
        shipment.caseId,
        {
          kind: 'changeCarrier',
          legId: legId as never,
          carrierId: 'CAR-SECURA' as never,
          vehicleId: 'VEH-SC-REEFER-3T' as never,
        },
        'TRANSPORT_PLANNER',
      )
      expect(gate(view, 'R13')).toBe('WAITING_HUMAN')
      expect(tasksFor(view, 'R13').map((task) => task.status)).toEqual(['SUPERSEDED', 'OPEN'])
      expect(gate(view, 'R36')).toBe('PASS')
    })
  })

  it('withdraws an open task that a change made stale and unreachable', async () => {
    const coordinator = startCoordinator()
    const before = await coordinator.submitCase({
      shipment: baseShipment,
      scriptedSemanticAnswers: logOne.scriptedSemanticAnswers,
    })
    const loadTask = openTask(before, 'R39-LOAD')
    const after = await coordinator.applyChange(
      baseShipment.caseId,
      { kind: 'changeQuote', amountCents: 4_000_000 },
      'COMMERCIAL_MANAGER',
    )
    expect(gate(after, 'R39-LOAD')).toBe('BLOCKED_DEPENDENCY')
    expect(tasksFor(after, 'R39-LOAD')).toMatchObject([
      { humanTaskId: loadTask?.humanTaskId, status: 'CANCELLED' },
    ])
    expect(openTask(after, 'R34')).toBeDefined()
  })

  it('only lets the responsible role change the plan, and never after dispatch', async () => {
    const coordinator = startCoordinator()
    await coordinator.submitCase({
      shipment: baseShipment,
      scriptedSemanticAnswers: logOne.scriptedSemanticAnswers,
    })
    await expect(
      coordinator.applyChange(
        baseShipment.caseId,
        { kind: 'changeQuote', amountCents: 1 },
        'TRANSPORT_PLANNER',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    let view = coordinator.getCase(baseShipment.caseId)
    await coordinator.completeHumanTask(
      openTask(view, 'R39-LOAD')?.humanTaskId ?? '',
      'WAREHOUSE_OPERATOR',
      {
        loadScanRef: 'S',
        physicalCheckBy: 'op',
      },
    )
    view = await coordinator.dispatch(baseShipment.caseId, 'DISPATCHER')
    await expect(
      coordinator.applyChange(
        baseShipment.caseId,
        { kind: 'changeQuote', amountCents: 1 },
        'COMMERCIAL_MANAGER',
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(view.orderStatus).toBe('DISPATCHED')
  })
})
