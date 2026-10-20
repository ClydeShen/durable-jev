import { readFileSync } from 'node:fs'
import type { ReferenceData } from '@durable-jev/contracts'
import { buildRuleConfiguration } from '@durable-jev/rule-evaluation'
import { openDatabase } from '@durable-jev/store'
import { describe, expect, it } from 'vitest'
import { inProcessEvaluators } from './branch-evaluators.js'
import { CoordinatorService } from './coordinator-service.js'
import { type Investigator, inProcessInvestigator } from './investigator.js'
import { coordinatorMigrations } from './persistence/coordinator-migrations.js'

const materials = new URL('../../../eval/materials/', import.meta.url)
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, materials), 'utf8'))
const logFour = readJson('cases/LOG-004.json')
const caseId = logFour.shipment.caseId as string

async function submittedLogFour(
  wrapInvestigator: (
    investigator: Investigator,
    coordinator: () => CoordinatorService,
  ) => Investigator = (investigator) => investigator,
) {
  const configuration = buildRuleConfiguration(
    readJson('rules.json'),
    readJson('mock-policy-parameters.json'),
    {
      mixingMatrix: readJson('decision-tables/mixing-matrix.json'),
      semanticQuestions: readJson('semantic-questions.json'),
    },
  )
  const referenceData = readJson('mock-data/reference-data.json') as ReferenceData
  const coordinator = new CoordinatorService({
    database: openDatabase(':memory:', coordinatorMigrations),
    configuration,
    evaluators: inProcessEvaluators(configuration, referenceData),
    investigator: wrapInvestigator(
      inProcessInvestigator(configuration, referenceData),
      () => coordinator,
    ),
    now: () => '2026-11-02T08:00:00.000Z',
  })
  await coordinator.submitCase({
    shipment: logFour.shipment,
    evidence: logFour.evidence,
    scriptedSemanticAnswers: logFour.scriptedSemanticAnswers,
  })
  return coordinator
}

const securaCancelled = {
  legId: 'LOG-004-LEG-1',
  unavailableCarrierIds: ['CAR-SECURA'],
  reason: 'Secura cancelled the booking: vehicle breakdown.',
}

describe('carrier investigation', () => {
  it('proposes a replacement without changing the order', async () => {
    const coordinator = await submittedLogFour()
    const investigation = await coordinator.investigateCarrier(
      caseId,
      securaCancelled,
      'TRANSPORT_PLANNER',
    )
    expect(investigation).toMatchObject({
      status: 'PROPOSED',
      caseRevision: 1,
      proposal: { carrierId: 'CAR-GLACIER', vehicleId: 'VEH-GL-REEFER-4T' },
      modelId: 'scripted-transport-investigator',
    })
    expect(coordinator.getCase(caseId).shipment.legs[0]?.carrierId).toBe('CAR-SECURA')
  })

  it('applies the proposal as a plan change once the planner accepts it', async () => {
    const coordinator = await submittedLogFour()
    const { investigationId } = await coordinator.investigateCarrier(
      caseId,
      securaCancelled,
      'TRANSPORT_PLANNER',
    )
    const view = await coordinator.acceptInvestigation(investigationId, 'TRANSPORT_PLANNER')
    expect(view.shipment.caseRevision).toBe(2)
    expect(view.shipment.legs[0]).toMatchObject({
      carrierId: 'CAR-GLACIER',
      vehicleId: 'VEH-GL-REEFER-4T',
    })
    expect(view.changes.at(-1)?.change.kind).toBe('changeCarrier')
    expect(view.investigations[0]?.status).toBe('ACCEPTED')
    const r11 = view.checks.find((check) => check.ruleId === 'R11')
    expect(r11).toMatchObject({ gateStatus: 'PASS', affectedByChange: `CHG-${caseId}-r2` })
  })

  it('only lets the planner start or accept an investigation', async () => {
    const coordinator = await submittedLogFour()
    await expect(
      coordinator.investigateCarrier(caseId, securaCancelled, 'DISPATCHER'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    const { investigationId } = await coordinator.investigateCarrier(
      caseId,
      securaCancelled,
      'TRANSPORT_PLANNER',
    )
    await expect(
      coordinator.acceptInvestigation(investigationId, 'COMPLIANCE_REVIEWER'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('makes a proposal stale when the plan changes first', async () => {
    const coordinator = await submittedLogFour()
    const { investigationId } = await coordinator.investigateCarrier(
      caseId,
      securaCancelled,
      'TRANSPORT_PLANNER',
    )
    await coordinator.applyChange(
      caseId,
      { kind: 'changeQuote', amountCents: 150_000 },
      'COMMERCIAL_MANAGER',
    )
    await expect(
      coordinator.acceptInvestigation(investigationId, 'TRANSPORT_PLANNER'),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(coordinator.getCase(caseId).investigations[0]?.status).toBe('STALE')
  })

  it('archives a result that arrives after the order moved to a new revision', async () => {
    const coordinator = await submittedLogFour((investigator, current) => async (input) => {
      // The quote changes while the agent is still working on revision 1.
      await current().applyChange(
        caseId,
        { kind: 'changeQuote', amountCents: 150_000 },
        'COMMERCIAL_MANAGER',
      )
      return investigator(input)
    })
    const investigation = await coordinator.investigateCarrier(
      caseId,
      securaCancelled,
      'TRANSPORT_PLANNER',
    )
    expect(investigation).toMatchObject({ status: 'STALE', caseRevision: 1 })
    expect(coordinator.getCase(caseId).shipment.legs[0]?.carrierId).toBe('CAR-SECURA')
    await expect(
      coordinator.acceptInvestigation(investigation.investigationId, 'TRANSPORT_PLANNER'),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('records a rejection without touching the plan', async () => {
    const coordinator = await submittedLogFour()
    const { investigationId } = await coordinator.investigateCarrier(
      caseId,
      securaCancelled,
      'TRANSPORT_PLANNER',
    )
    const rejected = coordinator.rejectInvestigation(
      investigationId,
      'TRANSPORT_PLANNER',
      'Glacier is fully booked this week',
    )
    expect(rejected).toMatchObject({ status: 'REJECTED', decisionReason: expect.any(String) })
    expect(coordinator.getCase(caseId).shipment.caseRevision).toBe(1)
  })
})
