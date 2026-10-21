import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { buildRuleConfiguration } from '@durable-jev/rule-evaluation'
import { openDatabase } from '@durable-jev/store'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inProcessEvaluators } from '../branch.evaluator.js'
import { CoordinatorService } from '../coordinator.service.js'
import { inProcessInvestigator } from '../investigator.service.js'
import { coordinatorMigrations } from '../persistence/coordinator.migrations.js'
import { createCoordinatorApp } from './coordinator.app.js'

const materials = new URL('../../../../eval/materials/', import.meta.url)
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, materials), 'utf8'))
const logOne = readJson('cases/LOG-001.json')
const logTwo = readJson('cases/LOG-002.json')

let baseUrl = ''
let close = () => {}

beforeAll(async () => {
  const configuration = buildRuleConfiguration(
    readJson('rules.json'),
    readJson('mock-policy-parameters.json'),
    {
      mixingMatrix: readJson('decision-tables/mixing-matrix.json'),
      semanticQuestions: readJson('semantic-questions.json'),
    },
  )
  const coordinator = new CoordinatorService({
    database: openDatabase(':memory:', coordinatorMigrations),
    configuration,
    evaluators: inProcessEvaluators(configuration, readJson('mock-data/reference-data.json')),
    investigator: inProcessInvestigator(configuration, readJson('mock-data/reference-data.json')),
  })
  const server = createCoordinatorApp(coordinator).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  close = () => server.close()
})
afterAll(() => close())

const call = async (
  method: string,
  path: string,
  options: { role?: string; body?: unknown } = {},
) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(options.role ? { 'x-demo-role': options.role } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  })
  return { status: response.status, body: await response.json() }
}

describe('coordinator HTTP API', () => {
  it('runs LOG-001 from submission to dispatch', async () => {
    const submitted = await call('POST', '/cases', {
      body: { shipment: logOne.shipment, scriptedSemanticAnswers: logOne.scriptedSemanticAnswers },
    })
    expect(submitted).toMatchObject({ status: 201, body: { orderStatus: 'AWAITING_HUMAN' } })

    const warehouseQueue = await call('GET', '/human-tasks?role=WAREHOUSE_OPERATOR')
    const loadTask = warehouseQueue.body[0]
    expect(loadTask.ruleId).toBe('R39-LOAD')

    const unauthenticated = await call('POST', `/human-tasks/${loadTask.humanTaskId}/complete`, {
      body: { fields: {} },
    })
    expect(unauthenticated.status).toBe(403)

    const loaded = await call('POST', `/human-tasks/${loadTask.humanTaskId}/complete`, {
      role: 'WAREHOUSE_OPERATOR',
      body: { fields: { loadScanRef: 'SCAN-1', physicalCheckBy: 'op-2' } },
    })
    expect(loaded).toMatchObject({ status: 200, body: { status: 'COMPLETED' } })

    const dispatched = await call('POST', `/cases/${logOne.caseId}/dispatch`, {
      role: 'DISPATCHER',
    })
    expect(dispatched).toMatchObject({ status: 200, body: { orderStatus: 'DISPATCHED' } })
  })

  it('lets the planner run a carrier investigation and accept its proposal', async () => {
    await call('POST', '/cases', {
      body: {
        shipment: logTwo.shipment,
        evidence: logTwo.evidence,
        scriptedSemanticAnswers: logTwo.scriptedSemanticAnswers,
      },
    })
    const request = {
      legId: logTwo.shipment.legs[0].legId,
      unavailableCarrierIds: [logTwo.shipment.legs[0].carrierId],
      reason: 'Carrier cancelled',
    }
    const forbidden = await call('POST', `/cases/${logTwo.caseId}/investigations`, {
      role: 'DISPATCHER',
      body: request,
    })
    expect(forbidden.status).toBe(403)

    const investigation = await call('POST', `/cases/${logTwo.caseId}/investigations`, {
      role: 'TRANSPORT_PLANNER',
      body: request,
    })
    expect(investigation).toMatchObject({ status: 201, body: { status: 'PROPOSED' } })

    const accepted = await call(
      'POST',
      `/investigations/${investigation.body.investigationId}/accept`,
      { role: 'TRANSPORT_PLANNER' },
    )
    expect(accepted.status).toBe(200)
    expect(accepted.body.shipment.legs[0].carrierId).toBe(investigation.body.proposal.carrierId)
    expect(accepted.body.investigations[0].status).toBe('ACCEPTED')

    const again = await call(
      'POST',
      `/investigations/${investigation.body.investigationId}/accept`,
      {
        role: 'TRANSPORT_PLANNER',
      },
    )
    expect(again.status).toBe(409)
  })

  it('lists rules in evaluation order', async () => {
    const { body } = await call('GET', '/rules')
    expect(body.rules.at(-1).ruleId).toBe('R40')
  })

  it('rejects malformed shipments and unknown cases', async () => {
    expect((await call('POST', '/cases', { body: { shipment: { caseId: 'x' } } })).status).toBe(400)
    expect((await call('GET', '/cases/CASE-UNKNOWN')).status).toBe(404)
  })
})
