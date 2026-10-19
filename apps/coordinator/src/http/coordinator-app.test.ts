import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { openDatabase } from '@durable-jev/store'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildRuleConfiguration } from '../configuration.js'
import { CoordinatorService } from '../coordinator-service.js'
import { coordinatorMigrations } from '../persistence/coordinator-migrations.js'
import { createCoordinatorApp } from './coordinator-app.js'

const materials = new URL('../../../../eval/materials/', import.meta.url)
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, materials), 'utf8'))
const logOne = readJson('cases/LOG-001.json')

let baseUrl = ''
let close = () => {}

beforeAll(async () => {
  const coordinator = new CoordinatorService({
    database: openDatabase(':memory:', coordinatorMigrations),
    configuration: buildRuleConfiguration(
      readJson('rules.json'),
      readJson('mock-policy-parameters.json'),
    ),
    referenceData: readJson('mock-data/reference-data.json'),
  })
  const server = createCoordinatorApp(coordinator).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  close = () => server.close()
})
afterAll(() => close())

async function call(method: string, path: string, options: { role?: string; body?: unknown } = {}) {
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

  it('lists rules in evaluation order', async () => {
    const { body } = await call('GET', '/rules')
    expect(body.rules.at(-1).ruleId).toBe('R40')
  })

  it('rejects malformed shipments and unknown cases', async () => {
    expect((await call('POST', '/cases', { body: { shipment: { caseId: 'x' } } })).status).toBe(400)
    expect((await call('GET', '/cases/CASE-UNKNOWN')).status).toBe(404)
  })
})
