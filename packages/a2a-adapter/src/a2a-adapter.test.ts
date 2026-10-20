import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { ClientFactory } from '@a2a-js/sdk/client'
import type { BranchEvaluationRequest } from '@durable-jev/contracts'
import { openDatabase } from '@durable-jev/store'
import express from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { A2aCallError, a2aBranchEvaluator } from './a2a-branch-client.js'
import { branchAgentCard, evaluationExecutor, mountA2a } from './a2a-server.js'
import { a2aServerMigrations } from './sqlite-task-store.js'
import { A2aTaskLinks, a2aClientMigrations } from './task-links.js'

const materials = new URL('../../../eval/materials/', import.meta.url)
const logOne = JSON.parse(readFileSync(new URL('cases/LOG-001.json', materials), 'utf8'))

const request = (overrides: Partial<BranchEvaluationRequest> = {}): BranchEvaluationRequest => ({
  caseId: logOne.caseId,
  caseRevision: 1,
  shipment: logOne.shipment,
  evidence: { documents: [], temperatureLogs: [], inspectionNotes: [] },
  semanticAnswers: [],
  upstreamResults: [],
  humanGates: [],
  ...overrides,
})

// Stand-in for a branch service: answers with one check per request and counts executions.
let executions = 0
let failNext = false
const serverDatabase = openDatabase(':memory:', a2aServerMigrations)
const linksDatabase = openDatabase(':memory:', a2aClientMigrations)
const links = new A2aTaskLinks(linksDatabase)
let baseUrl = ''
let close = () => {}

beforeAll(async () => {
  const app = express()
  const server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  mountA2a(app, {
    card: branchAgentCard({ serviceName: 'commercial-control', branches: ['commercial'], baseUrl }),
    executor: evaluationExecutor(async (evaluation) => {
      executions += 1
      if (failNext) {
        failNext = false
        throw new Error('database locked')
      }
      return {
        evaluations: [
          {
            ruleId: 'R31' as never,
            subject: { scope: 'order', entityId: 'order' },
            gateStatus: 'PASS',
            observedValue: { revision: evaluation.caseRevision },
            blockedBy: [],
          },
        ],
        humanGateRequests: [],
      }
    }),
    database: serverDatabase,
  })
  close = () => server.close()
})
afterAll(() => close())

const evaluator = () => a2aBranchEvaluator('commercial-control', ['commercial'], baseUrl, links)

describe('A2A adapter', () => {
  it('publishes an Agent Card that names the skill and its branches', async () => {
    const card = await (await new ClientFactory().createFromUrl(baseUrl)).getAgentCard()
    expect(card.name).toBe('commercial-control')
    expect(card.skills[0]).toMatchObject({ id: 'evaluate-branches', tags: ['commercial'] })
  })

  it('evaluates over A2A and records which task answered which request', async () => {
    const result = await evaluator().evaluate(request())
    expect(result.evaluations[0]).toMatchObject({ ruleId: 'R31', gateStatus: 'PASS' })
    const [link] = links.forCase(logOne.caseId)
    expect(link).toMatchObject({ capability: 'commercial-control', state: 'TASK_STATE_COMPLETED' })

    const client = await new ClientFactory().createFromUrl(baseUrl)
    const task = await client.getTask({ tenant: '', id: link?.a2aTaskId } as never)
    expect(task.id).toBe(link?.a2aTaskId)
  })

  it('reuses the finished task for the same request instead of delegating again', async () => {
    const before = executions
    const result = await evaluator().evaluate(request())
    expect(result.evaluations[0]?.gateStatus).toBe('PASS')
    expect(executions).toBe(before)
  })

  it('returns the original task when a lost response makes the client resend (F04)', async () => {
    const lost = request({ caseRevision: 2 })
    await evaluator().evaluate(lost)
    const before = executions
    const [, link] = links.forCase(logOne.caseId)
    // The client never saw the task id: only the message id it sent is on record.
    linksDatabase
      .prepare(
        "UPDATE a2a_task_links SET a2a_task_id = NULL, state = 'SENDING' WHERE request_key = ?",
      )
      .run(link?.requestKey)
    await evaluator().evaluate(lost)
    expect(executions).toBe(before)
    expect(links.find(link?.requestKey ?? '')?.a2aTaskId).toBe(link?.a2aTaskId)
  })

  it('starts a new task linked to a failed one rather than continuing it', async () => {
    const failing = request({ caseRevision: 3 })
    failNext = true
    await expect(evaluator().evaluate(failing)).rejects.toBeInstanceOf(A2aCallError)
    const failed = links.forCase(logOne.caseId).at(-1)
    expect(failed?.state).toBe('TASK_STATE_FAILED')

    await evaluator().evaluate(failing)
    const retried = links.find(failed?.requestKey ?? '')
    expect(retried).toMatchObject({
      state: 'TASK_STATE_COMPLETED',
      previousTaskIds: [failed?.a2aTaskId],
    })
    expect(retried?.a2aTaskId).not.toBe(failed?.a2aTaskId)
  })

  it('reports an unreachable service as a call error', async () => {
    const offline = a2aBranchEvaluator(
      'cargo-assurance',
      ['controlled'],
      'http://127.0.0.1:9',
      links,
      500,
    )
    await expect(offline.evaluate(request())).rejects.toBeInstanceOf(A2aCallError)
  })
})
