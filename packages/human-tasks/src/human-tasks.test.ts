import type { HumanTask, HumanTaskTarget } from '@durable-jev/contracts'
import { humanTaskSchema } from '@durable-jev/contracts'
import { describe, expect, it } from 'vitest'
import { type ChainShape, chainOutcome, gateStatusOf, stepsToOpen } from './approval-chain.js'

const stepsOf = (...tasks: HumanTask[]) =>
  new Map(tasks.map((chainTask) => [chainTask.approvalChain?.stepIndex ?? 0, chainTask]))

import { type ActionContext, type Actor, decideHumanTask } from './decide-human-task.js'

const target: HumanTaskTarget = {
  caseRevision: 1,
  entityVersions: { cargo: 1, route: 1, carrier: 1, quote: 1 },
  inputFingerprint: 'fp-1',
}

const compliance: Actor = { id: 'alice', role: 'complianceReviewer' }
const quality: Actor = { id: 'bob', role: 'qualityReviewer' }
const warehouse: Actor = { id: 'wen', role: 'warehouseOperator' }

function task(overrides: Partial<HumanTask> = {}): HumanTask {
  return {
    humanTaskId: 'HT-1',
    caseId: 'LOG-003',
    ruleId: 'R13',
    scope: { kind: 'cargoItem', cargoItemId: 'ITEM-2' },
    taskType: 'APPROVAL',
    requiredRole: 'complianceReviewer',
    prerequisites: ['R10', 'R11', 'R12'],
    evidenceRequirements: [],
    target,
    status: 'OPEN',
    createdAt: '2026-11-01T08:00:00.000Z',
    expiresAt: '2026-11-01T20:00:00.000Z',
    ...overrides,
  }
}

const at = (now: string, extra: Partial<ActionContext> = {}): ActionContext => ({
  now,
  currentTarget: target,
  ...extra,
})
const morning = at('2026-11-01T09:00:00.000Z')

function approved(decision: ReturnType<typeof decideHumanTask>): HumanTask {
  if (!decision.ok) throw new Error(decision.message)
  expect(humanTaskSchema.safeParse(decision.task).success).toBe(true)
  return decision.task
}

describe('decideHumanTask', () => {
  it('records an approval by the required role', () => {
    const result = approved(
      decideHumanTask(task(), { type: 'approve', actor: compliance }, morning),
    )
    expect(result).toMatchObject({ status: 'APPROVED', decision: { decidedBy: 'alice' } })
  })

  it('refuses an unauthorized approver (F11)', () => {
    const decision = decideHumanTask(task(), { type: 'approve', actor: quality }, morning)
    expect(decision).toMatchObject({ ok: false, reason: 'UNAUTHORIZED' })
  })

  it('refuses decisions after expiry and lets the task expire (F12)', () => {
    const evening = at('2026-11-01T20:00:00.000Z')
    expect(decideHumanTask(task(), { type: 'approve', actor: compliance }, evening)).toMatchObject({
      ok: false,
      reason: 'EXPIRED',
    })
    expect(decideHumanTask(task(), { type: 'expire' }, morning)).toMatchObject({
      ok: false,
      reason: 'NOT_EXPIRED',
    })
    expect(approved(decideHumanTask(task(), { type: 'expire' }, evening)).status).toBe('EXPIRED')
  })

  it('ignores a late approval for an old version of the case (F13)', () => {
    const rerouted = at('2026-11-01T09:00:00.000Z', {
      currentTarget: {
        ...target,
        entityVersions: { ...target.entityVersions, carrier: 2 },
        inputFingerprint: 'fp-2',
      },
    })
    expect(decideHumanTask(task(), { type: 'approve', actor: compliance }, rerouted)).toMatchObject(
      {
        ok: false,
        reason: 'STALE_TARGET',
      },
    )
  })

  it('requires every evidence field to complete an operation (F14)', () => {
    const retest = task({
      ruleId: 'R22',
      taskType: 'OPERATION',
      requiredRole: 'warehouseOperator',
      evidenceRequirements: ['retestTemperatureDeciC', 'retestPhotoRef'],
    })
    const partial = decideHumanTask(
      retest,
      {
        type: 'complete',
        actor: warehouse,
        fields: { retestTemperatureDeciC: 52 },
        evidenceRefs: [],
      },
      morning,
    )
    expect(partial).toMatchObject({ ok: false, reason: 'MISSING_EVIDENCE' })
    const complete = decideHumanTask(
      retest,
      {
        type: 'complete',
        actor: warehouse,
        fields: { retestTemperatureDeciC: 52, retestPhotoRef: 'photo-1' },
        evidenceRefs: ['photo-1'],
      },
      morning,
    )
    expect(approved(complete).status).toBe('COMPLETED')
    expect(decideHumanTask(retest, { type: 'approve', actor: warehouse }, morning)).toMatchObject({
      ok: false,
      reason: 'WRONG_TASK_TYPE',
    })
  })

  it('supersedes an approval when the case changes', () => {
    const done = approved(decideHumanTask(task(), { type: 'approve', actor: compliance }, morning))
    expect(
      approved(decideHumanTask(done, { type: 'supersede', by: 'HT-9' }, morning)),
    ).toMatchObject({
      status: 'SUPERSEDED',
      supersededBy: 'HT-9',
      decision: { decidedBy: 'alice' },
    })
  })
})

describe('approval chains', () => {
  const sequential: ChainShape = { mode: 'sequential', stepCount: 2 }
  const chainId = 'LOG-003:R13'
  const step = (stepIndex: number, overrides: Partial<HumanTask> = {}) =>
    task({
      humanTaskId: `HT-${stepIndex + 1}`,
      requiredRole: stepIndex === 0 ? 'complianceReviewer' : 'qualityReviewer',
      approvalChain: { chainId, ...sequential, distinctActors: true, stepIndex },
      ...overrides,
    })

  it('opens sequential steps one at a time', () => {
    expect(stepsToOpen(sequential, stepsOf())).toEqual([0])
    const first = step(0)
    expect(stepsToOpen(sequential, stepsOf(first))).toEqual([])
    const firstApproved = approved(
      decideHumanTask(first, { type: 'approve', actor: compliance }, morning),
    )
    expect(stepsToOpen(sequential, stepsOf(firstApproved))).toEqual([1])
    expect(gateStatusOf(chainOutcome(sequential, stepsOf(firstApproved)))).toBe('WAITING_HUMAN')
  })

  it('refuses a later step before the earlier one is approved', () => {
    const decision = decideHumanTask(
      step(1),
      { type: 'approve', actor: quality },
      at(morning.now, { chainTasks: [step(0)] }),
    )
    expect(decision).toMatchObject({ ok: false, reason: 'STEP_NOT_ACTIVE' })
  })

  it('passes once every step is approved by different people', () => {
    const first = approved(
      decideHumanTask(step(0), { type: 'approve', actor: compliance }, morning),
    )
    const second = approved(
      decideHumanTask(
        step(1),
        { type: 'approve', actor: quality },
        at(morning.now, { chainTasks: [first] }),
      ),
    )
    expect(gateStatusOf(chainOutcome(sequential, stepsOf(first, second)))).toBe('PASS')
  })

  it('does not let the same person sign two steps (four eyes)', () => {
    const credit: ChainShape = { mode: 'sequential', stepCount: 2 }
    const manager = (id: string): Actor => ({ id, role: 'commercialManager' })
    const creditStep = (stepIndex: number) =>
      task({
        humanTaskId: `CR-${stepIndex + 1}`,
        ruleId: 'R34',
        requiredRole: 'commercialManager',
        approvalChain: { chainId: 'LOG-005:R34', ...credit, distinctActors: true, stepIndex },
      })
    const first = approved(
      decideHumanTask(creditStep(0), { type: 'approve', actor: manager('carol') }, morning),
    )
    const context = at(morning.now, { chainTasks: [first] })
    expect(
      decideHumanTask(creditStep(1), { type: 'approve', actor: manager('carol') }, context),
    ).toMatchObject({
      ok: false,
      reason: 'SAME_ACTOR',
    })
    expect(
      approved(decideHumanTask(creditStep(1), { type: 'approve', actor: manager('dave') }, context))
        .status,
    ).toBe('APPROVED')
  })

  it('fails the gate as soon as any step is rejected', () => {
    const parallel: ChainShape = { ...sequential, mode: 'parallel' }
    const parallelStep = (stepIndex: number) =>
      step(stepIndex, { approvalChain: { chainId, ...parallel, distinctActors: true, stepIndex } })
    expect(stepsToOpen(parallel, stepsOf())).toEqual([0, 1])
    const rejected = approved(
      decideHumanTask(parallelStep(1), { type: 'reject', actor: quality }, morning),
    )
    expect(chainOutcome(parallel, stepsOf(parallelStep(0), rejected))).toEqual({
      status: 'REJECTED',
      stepIndex: 1,
    })
    expect(gateStatusOf(chainOutcome(parallel, stepsOf(parallelStep(0), rejected)))).toBe('FAIL')
    expect(stepsToOpen(parallel, stepsOf(parallelStep(0), rejected))).toEqual([])
  })

  it('treats an expired step as no approval', () => {
    const expired = approved(
      decideHumanTask(step(0), { type: 'expire' }, at('2026-11-02T00:00:00.000Z')),
    )
    expect(gateStatusOf(chainOutcome(sequential, stepsOf(expired)))).toBe('UNKNOWN')
  })
})
