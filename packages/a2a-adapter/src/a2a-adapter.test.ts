import type { AddressInfo } from 'node:net'
import type { AgentCaseState, AgentClient } from '@durable-jev/agent-core'
import express from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { A2aAgentClient, type A2aTaskRecord } from './a2a-agent-client.js'
import { a2aRoutes, agentCard } from './a2a-server.js'

const emptyState: AgentCaseState = { caseRevision: 1, outcomes: [], tasks: [] }
const submitted: string[] = []

const native: AgentClient = {
  agentId: 'cargo-assurance',
  submit: async (shipment) => {
    submitted.push(shipment.caseId)
    return emptyState
  },
  evaluate: async () => emptyState,
  state: async (caseId) => {
    if (caseId === 'MISSING') throw new Error('case MISSING does not exist')
    return emptyState
  },
  decide: async () => ({ ok: false, reason: 'NOT_FOUND', message: 'no task' }),
  openTasks: async () => [],
  events: async () => [],
  acknowledgeEvents: async () => {},
  reset: async () => {},
}

let server: ReturnType<express.Express['listen']>
let client: A2aAgentClient
const tasks: A2aTaskRecord[] = []

beforeAll(async () => {
  const app = express()
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`
  app.use(a2aRoutes(native, agentCard({ name: 'Cargo', description: 'test' }, baseUrl, '1')))
  client = new A2aAgentClient('cargo-assurance', baseUrl, native, (record) => tasks.push(record))
})

afterAll(() => server.close())

const shipment = (
  await import('../../../eval/materials/cases/LOG-001.json', { with: { type: 'json' } })
).default.shipment as Parameters<AgentClient['submit']>[0]

describe('A2A adapter', () => {
  it('maps a skill call to one completed A2A task carrying the result', async () => {
    await expect(client.state('LOG-001')).resolves.toEqual(emptyState)
    expect(tasks.at(-1)).toMatchObject({ skill: 'case-state', state: 'TASK_STATE_COMPLETED' })
  })

  it('answers a retried submit from the first task without running it again', async () => {
    await client.submit(shipment)
    await client.submit(shipment)
    expect(submitted).toEqual(['LOG-001'])
    const [first, retry] = tasks.slice(-2)
    expect(retry?.duplicateOf).toBe(first?.taskId)
  })

  it('reports a failed task as an error', async () => {
    await expect(client.state('MISSING')).rejects.toThrow(/case MISSING does not exist/)
    expect(tasks.at(-1)?.state).toBe('TASK_STATE_FAILED')
  })
})
