import type { Shipment } from '@durable-jev/contracts'
import { ScriptedJudge } from '@durable-jev/model-providers'
import type { CaseFacts, RuleDefinition } from '@durable-jev/rule-engine'
import { describe, expect, it } from 'vitest'
import { CaseRuntime } from './case-runtime.js'
import { CaseStore } from './case-store.js'

function rule(ruleId: string, overrides: Partial<RuleDefinition>): RuleDefinition {
  return {
    ruleId,
    version: '1',
    title: ruleId,
    owner: 'order-coordination',
    scope: 'order',
    dependsOn: [],
    evaluator: { kind: 'expression', ref: ruleId },
    unknownPolicy: 'block',
    inputPaths: [],
    parameters: [],
    invalidationTriggers: ['cargo'],
    ...overrides,
  }
}

const rules: RuleDefinition[] = [
  rule('R01', { expression: { passWhen: 'count(cargoItems) > 0' } }),
  rule('R39', {
    dependsOn: ['R01'],
    evaluator: { kind: 'humanGate', ref: 'R39' },
    humanGate: {
      taskType: 'OPERATION',
      steps: [{ requiredRole: 'warehouseOperator' }],
      mode: 'sequential',
      distinctActors: true,
      evidenceRequirements: ['loadScanId'],
      expiresAfterHours: 12,
    },
  }),
  rule('R40', {
    dependsOn: ['R01', 'R39'],
    evaluator: { kind: 'combinator', ref: 'R40' },
    combiner: {
      op: 'and',
      of: [
        { op: 'ref', ruleId: 'R01' },
        { op: 'ref', ruleId: 'R39' },
      ],
    },
  }),
]

const shipment = {
  caseId: 'LOG-T',
  correlationId: 'corr-LOG-T',
  shipmentId: 'SHP-T',
  customerId: 'CUS-1',
  destinationCountry: 'NZ',
  caseRevision: 1,
  entityVersions: { cargo: 1, route: 1, carrier: 1, quote: 1 },
  cargoItems: [{ cargoItemId: 'ITEM-1' }],
  legs: [],
} as unknown as Shipment

const factsOf = (case_: Shipment): CaseFacts => ({
  entityVersions: case_.entityVersions,
  order: {},
  cargoItems: case_.cargoItems.map((item) => ({ cargoItemId: item.cargoItemId, facts: {} })),
  legs: [],
})

function runtime(now = () => '2026-11-02T08:00:00.000Z') {
  const store = CaseStore.open(':memory:')
  return {
    store,
    runtime: new CaseRuntime({
      store,
      rulePack: {
        policyVersion: 'test',
        ruleSet: { ruleSetVersion: 't', rules, mixingMatrix: [] },
        parameters: {},
        clauses: new Map(),
      },
      judgeFor: () => new ScriptedJudge([]),
      codeEvaluators: new Map(),
      factsOf,
      now,
    }),
  }
}

const warehouse = { id: 'wen', role: 'warehouseOperator' } as const
const statusOf = (view: { outcomes: { ruleId: string; status: string }[] }, ruleId: string) =>
  view.outcomes.find((outcome) => outcome.ruleId === ruleId)?.status

describe('CaseRuntime', () => {
  it('opens the loading task, then releases once the warehouse completes it', async () => {
    const { runtime: agent } = runtime()
    const submitted = await agent.submit(shipment)
    expect(statusOf(submitted, 'R40')).toBe('WAITING_HUMAN')
    const [task] = submitted.tasks
    expect(task).toMatchObject({ ruleId: 'R39', status: 'OPEN', requiredRole: 'warehouseOperator' })
    const decision = await agent.decide(task?.humanTaskId ?? '', {
      type: 'complete',
      actor: warehouse,
      fields: { loadScanId: 'SCAN-1' },
      evidenceRefs: [],
    })
    expect(decision.ok).toBe(true)
    expect(statusOf(agent.view('LOG-T'), 'R40')).toBe('PASS')
  })

  it('refuses the wrong role and does not duplicate tasks on re-evaluation', async () => {
    const { runtime: agent } = runtime()
    const [task] = (await agent.submit(shipment)).tasks
    const decision = await agent.decide(task?.humanTaskId ?? '', {
      type: 'complete',
      actor: { id: 'dee', role: 'dispatcher' },
      fields: { loadScanId: 'SCAN-1' },
      evidenceRefs: [],
    })
    expect(decision).toMatchObject({ ok: false, reason: 'UNAUTHORIZED' })
    expect((await agent.evaluate('LOG-T')).tasks).toHaveLength(1)
  })

  it('supersedes the loading task when the cargo changes', async () => {
    const { runtime: agent } = runtime()
    const [first] = (await agent.submit(shipment)).tasks
    const revised = {
      ...shipment,
      caseRevision: 2,
      entityVersions: { ...shipment.entityVersions, cargo: 2 },
      cargoItems: [{ cargoItemId: 'ITEM-1' }, { cargoItemId: 'ITEM-2' }],
    } as unknown as Shipment
    const view = await agent.submit(revised)
    expect(view.tasks.find((task) => task.humanTaskId === first?.humanTaskId)?.status).toBe(
      'SUPERSEDED',
    )
    expect(view.tasks.filter((task) => task.status === 'OPEN')).toHaveLength(1)
    expect(view.outcomes.find((outcome) => outcome.ruleId === 'R39')?.invalidatedBy).toBe(
      'r2 (cargo)',
    )
  })

  it('withdraws an open task whose rule now waits on changed inputs', async () => {
    const { runtime: agent } = runtime()
    const [first] = (await agent.submit(shipment)).tasks
    const emptied = {
      ...shipment,
      caseRevision: 2,
      entityVersions: { ...shipment.entityVersions, cargo: 2 },
      cargoItems: [],
    } as unknown as Shipment
    const view = await agent.submit(emptied)
    expect(statusOf(view, 'R39')).toBe('BLOCKED_DEPENDENCY')
    expect(view.tasks.find((task) => task.humanTaskId === first?.humanTaskId)?.status).toBe(
      'CANCELLED',
    )
  })

  it('reissues a task that expired', async () => {
    let now = '2026-11-02T08:00:00.000Z'
    const { runtime: agent } = runtime(() => now)
    const [first] = (await agent.submit(shipment)).tasks
    now = '2026-11-02T21:00:00.000Z'
    const view = await agent.evaluate('LOG-T')
    expect(view.tasks.find((task) => task.humanTaskId === first?.humanTaskId)?.status).toBe(
      'EXPIRED',
    )
    expect(
      view.tasks.filter((task) => task.status === 'OPEN').map((task) => task.humanTaskId),
    ).toEqual([first?.humanTaskId.replace('/r1#', '/r2#')])
  })
})
