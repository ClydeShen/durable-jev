import { mkdtempSync, rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  agentSummary,
  CaseRuntime,
  CaseStore,
  LocalAgentClient,
  type RulePack,
} from '@durable-jev/agent-core'
import { businessCaseSchema } from '@durable-jev/contracts'
import { type RuleDefinition, type RuleSet, validateRuleSet } from '@durable-jev/rule-engine'
import express, { type ErrorRequestHandler } from 'express'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { A2aAgentClient } from './a2a/a2a-agent-client.js'
import { a2aRoutes, agentCard } from './a2a/a2a-server.js'
import { agentRouter } from './native/agent-router.js'
import { HttpAgentClient } from './native/http-agent-client.js'

const recordSchema = businessCaseSchema
  .extend({ amountCents: z.number().int().nonnegative() })
  .strict()
const base: Pick<
  RuleDefinition,
  | 'owner'
  | 'scope'
  | 'version'
  | 'unknownPolicy'
  | 'parameters'
  | 'inputPaths'
  | 'invalidationTriggers'
> = {
  owner: 'record-review',
  scope: 'record',
  version: '1',
  unknownPolicy: 'block',
  parameters: [],
  inputPaths: [],
  invalidationTriggers: ['amount'],
}
const ruleSet: RuleSet = {
  rootScope: 'record',
  ruleSetVersion: 'contract',
  mixingMatrix: [],
  rules: [
    {
      ...base,
      ruleId: 'CHECK-01',
      title: 'Amount limit',
      dependsOn: [],
      evaluator: { kind: 'expression', ref: 'CHECK-01' },
      expression: { passWhen: 'record.amountCents <= params.limit' },
      parameters: ['limit'],
    },
    {
      ...base,
      ruleId: 'CHECK-02',
      title: 'Review',
      dependsOn: ['CHECK-01'],
      inputPaths: ['record.amountCents'],
      evaluator: { kind: 'humanGate', ref: 'CHECK-02' },
      humanGate: {
        taskType: 'APPROVAL',
        steps: [{ requiredRole: 'recordReviewer' }],
        mode: 'sequential',
        distinctActors: true,
        evidenceRequirements: [],
        expiresAfterHours: 12,
      },
    },
    {
      ...base,
      ruleId: 'CHECK-03',
      title: 'Ready',
      dependsOn: ['CHECK-02'],
      evaluator: { kind: 'combinator', ref: 'CHECK-03' },
      combiner: { op: 'ref', ruleId: 'CHECK-02' },
    },
  ],
}
const pack: RulePack = {
  policyVersion: 'fixture',
  ruleSet,
  parameters: { limit: 1000 },
  policy: { title: 'Contract fixture', preamble: [], sections: [] },
  clauses: new Map(),
}
const data = {
  caseId: 'REC-1',
  correlationId: 'corr-1',
  caseRevision: 1,
  entityVersions: { amount: 1 },
  amountCents: 100,
}
const stores = new Set<CaseStore<z.infer<typeof recordSchema>>>()
const directories: string[] = []

function open(path = ':memory:') {
  const store = CaseStore.open(path, recordSchema.parse)
  stores.add(store)
  const runtime = new CaseRuntime({
    store,
    rulePack: pack,
    agentId: 'record-review',
    codeEvaluators: new Map(),
    judgeFor: () => ({
      provider: 'scripted',
      ask: async () => {
        throw new Error('unexpected semantic question')
      },
    }),
    factsOf: (record) => ({
      entityVersions: record.entityVersions,
      root: { scope: { kind: 'record' }, facts: record },
      context: { record },
      collections: {},
    }),
    now: () => '2026-10-24T08:00:00Z',
  })
  return { store, runtime, client: new LocalAgentClient('record-review', runtime, store) }
}

afterEach(() => {
  for (const store of stores) store.db.close()
  stores.clear()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true })
})

describe('domain agent contract (synthetic record fixture, not an insurance experiment)', () => {
  it('validates new identities, roles and scopes without logistics vocabulary', () => {
    expect(
      validateRuleSet(ruleSet, {
        policyParameters: new Set(['limit']),
        constraints: {
          rootScope: 'record',
          scopes: ['record'],
          agents: ['record-review'],
          roles: ['recordReviewer'],
          invalidationTriggers: ['amount'],
        },
      }).valid,
    ).toBe(true)
  })

  it('restores waiting work from SQLite and reissues approval on changed facts', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'durable-jev-domain-agent-'))
    directories.push(directory)
    const path = join(directory, 'record.sqlite')
    const first = open(path)
    const pending = await first.runtime.submit(data)
    const task = pending.tasks[0]
    if (!task) throw new Error('missing review task')
    first.store.db.close()
    stores.delete(first.store)
    const restored = open(path)
    expect(restored.runtime.view(data.caseId).tasks[0]).toEqual(task)
    expect(
      await restored.runtime.decide(task.humanTaskId, {
        type: 'approve',
        actor: { id: 'other', role: 'wrongRole' },
      }),
    ).toMatchObject({ ok: false, reason: 'UNAUTHORIZED' })
    expect(
      await restored.runtime.decide(task.humanTaskId, {
        type: 'approve',
        actor: { id: 'reviewer', role: 'recordReviewer' },
      }),
    ).toMatchObject({ ok: true })
    expect(
      restored.runtime.view(data.caseId).outcomes.find((outcome) => outcome.ruleId === 'CHECK-03')
        ?.status,
    ).toBe('PASS')
    const revised = await restored.runtime.submit({
      ...data,
      caseRevision: 2,
      amountCents: 200,
      entityVersions: { amount: 2 },
    })
    expect(revised.tasks.find((item) => item.humanTaskId === task.humanTaskId)?.status).toBe(
      'SUPERSEDED',
    )
    expect(revised.tasks.filter((item) => item.status === 'OPEN')).toHaveLength(1)
  })

  it.each(['native', 'a2a'] as const)(
    'uses the same domain validation and flow over %s',
    async (mode) => {
      const agent = open()
      const app = express()
      app.use(express.json())
      const server = app.listen(0)
      await new Promise<void>((resolve) => server.once('listening', resolve))
      const url = `http://localhost:${(server.address() as AddressInfo).port}`
      app.use(
        '/agent',
        agentRouter(agent.client, () => agentSummary('record-review', pack, agent.store)),
      )
      app.use(
        a2aRoutes(
          agent.client,
          agentCard({ name: 'Record review', description: 'Contract fixture' }, url, '1'),
        ),
      )
      const errors: ErrorRequestHandler = (error, _request, response, _next) => {
        response.status(400).json({ error: String(error) })
      }
      app.use(errors)
      const native = new HttpAgentClient('record-review', url)
      const client = mode === 'native' ? native : new A2aAgentClient('record-review', url, native)
      try {
        const state = await client.submit(data)
        expect(state.tasks[0]?.requiredRole).toBe('recordReviewer')
        const task = state.tasks[0]
        if (!task) throw new Error('missing review task')
        expect(
          await client.decide(task.humanTaskId, {
            type: 'approve',
            actor: { id: 'reviewer', role: 'recordReviewer' },
          }),
        ).toMatchObject({ ok: true })
        expect(
          (await client.state(data.caseId)).outcomes.find(
            (outcome) => outcome.ruleId === 'CHECK-03',
          )?.status,
        ).toBe('PASS')
        await expect(
          client.submit({ ...data, caseId: 'INVALID', amountCents: 'invalid' }),
        ).rejects.toThrow()
        expect(agent.store.caseRecord('INVALID')).toBeUndefined()
        await client.reset(data.caseId)
        expect(agent.store.caseRecord(data.caseId)).toBeUndefined()
        await client.submit(data)
        expect(agent.store.caseRecord(data.caseId)?.data.amountCents).toBe(100)
        expect(
          (await client.state(data.caseId)).tasks.filter((item) => item.status === 'OPEN'),
        ).toHaveLength(1)
      } finally {
        server.closeAllConnections()
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        )
      }
    },
  )
})
