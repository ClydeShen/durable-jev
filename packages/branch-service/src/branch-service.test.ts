import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { A2aTaskLinks, a2aBranchEvaluator, a2aClientMigrations } from '@durable-jev/a2a-adapter'
import type { BranchEvaluationRequest } from '@durable-jev/contracts'
import { buildRuleConfiguration, evaluateBranch } from '@durable-jev/rule-evaluation'
import { openDatabase } from '@durable-jev/store'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { branchServiceMigrations, createBranchServiceApp } from './branch-service.app.js'
import { BranchUnavailableError, httpBranchEvaluator } from './http-branch.client.js'

const materials = new URL('../../../eval/materials/', import.meta.url)
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, materials), 'utf8'))
const logOne = readJson('cases/LOG-001.json')
const configuration = buildRuleConfiguration(
  readJson('rules.json'),
  readJson('mock-policy-parameters.json'),
  {
    mixingMatrix: readJson('decision-tables/mixing-matrix.json'),
    semanticQuestions: readJson('semantic-questions.json'),
  },
)
const referenceData = readJson('mock-data/reference-data.json')
const database = openDatabase(':memory:', branchServiceMigrations)

const baseRequest = (): BranchEvaluationRequest => ({
  caseId: logOne.caseId,
  caseRevision: 1,
  shipment: logOne.shipment,
  evidence: { documents: [], temperatureLogs: [], inspectionNotes: [] },
  semanticAnswers: logOne.scriptedSemanticAnswers,
  upstreamResults: [],
  humanGates: [],
})

let baseUrl = ''
let close = () => {}

beforeAll(async () => {
  const app = createBranchServiceApp({
    serviceName: 'commercial-control',
    branches: ['commercial'],
    configuration,
    referenceData,
    database,
    publicUrl: () => baseUrl,
    demoFaults: true,
  })
  const server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  close = () => server.close()
})
afterAll(() => close())

describe('branch service over HTTP', () => {
  it('evaluates its branch and logs the evaluation', async () => {
    const base = evaluateBranch(baseRequest(), { configuration, referenceData, branches: ['base'] })
    const evaluator = httpBranchEvaluator('commercial-control', ['commercial'], baseUrl)
    const result = await evaluator.evaluate({ ...baseRequest(), upstreamResults: base.evaluations })

    expect(result.evaluations.find((evaluation) => evaluation.ruleId === 'R36')?.gateStatus).toBe(
      'PASS',
    )
    expect(database.prepare('SELECT COUNT(*) AS count FROM evaluation_log').get()).toEqual({
      count: 1,
    })
  })

  it('answers the same evaluation over A2A as over native HTTP', async () => {
    const base = evaluateBranch(baseRequest(), { configuration, referenceData, branches: ['base'] })
    const request = { ...baseRequest(), caseRevision: 2, upstreamResults: base.evaluations }
    const native = await httpBranchEvaluator(
      'commercial-control',
      ['commercial'],
      baseUrl,
    ).evaluate(request)
    const links = new A2aTaskLinks(openDatabase(':memory:', a2aClientMigrations))
    const overA2a = await a2aBranchEvaluator(
      'commercial-control',
      ['commercial'],
      baseUrl,
      links,
    ).evaluate(request)
    expect(overA2a).toEqual(native)
  })

  it('can be slowed down for a demo so the caller times out', async () => {
    const setDelay = (ms: number) =>
      fetch(`${baseUrl}/faults/delay`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ms }),
      })
    expect((await setDelay(300)).status).toBe(200)
    const impatient = httpBranchEvaluator('commercial-control', ['commercial'], baseUrl, 100)
    await expect(impatient.evaluate(baseRequest())).rejects.toBeInstanceOf(BranchUnavailableError)
    await setDelay(0)
  })

  it('can pretend the model is unavailable for a demo, and recover', async () => {
    const setJudge = (unavailable: boolean) =>
      fetch(`${baseUrl}/faults/judge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ unavailable }),
      })
    expect(await (await setJudge(true)).json()).toMatchObject({ judgeUnavailable: true })
    expect(await (await setJudge(false)).json()).toMatchObject({ judgeUnavailable: false })
  })

  it('rejects a malformed request', async () => {
    const response = await fetch(`${baseUrl}/evaluations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ caseId: 'x' }),
    })
    expect(response.status).toBe(400)
  })

  it('reports an unreachable service as unavailable', async () => {
    const evaluator = httpBranchEvaluator(
      'cargo-assurance',
      ['controlled'],
      'http://127.0.0.1:9',
      500,
    )
    await expect(evaluator.evaluate(baseRequest())).rejects.toBeInstanceOf(BranchUnavailableError)
  })
})
