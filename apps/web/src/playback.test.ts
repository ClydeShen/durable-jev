import type { RuleOutcome } from '@durable-jev/rule-engine'
import { describe, expect, it } from 'vitest'
import type { TimelineEntry } from './api'
import { outcomesAt, playbackSteps } from './playback'

const order = { kind: 'order' } as const

function entry(
  eventName: string,
  payload: Record<string, unknown>,
  agentId = 'order-coordination',
): TimelineEntry {
  return {
    eventId: `${eventName}-${JSON.stringify(payload)}-${agentId}`,
    agentId,
    eventName,
    payload,
    createdAt: '',
  }
}

const outcome = (ruleId: string, status: RuleOutcome['status']): RuleOutcome =>
  ({ ruleId, scope: order, status, blockedBy: [] }) as unknown as RuleOutcome

const titles = new Map([
  ['R39', 'Loaded'],
  ['R40', 'Release allowed'],
])

// LOG-001 after the warehouse operator loads: the task, then R39 and R40 pass.
const loading = [
  entry('rule.evaluated', { ruleId: 'R39', scope: order, status: 'WAITING_HUMAN' }),
  entry('rule.evaluated', { ruleId: 'R40', scope: order, status: 'BLOCKED_DEPENDENCY' }),
  entry('human_task.decided', {
    ruleId: 'R39',
    status: 'COMPLETED',
    actor: { id: 'wen', role: 'warehouseOperator' },
  }),
  entry('rule.evaluated', { ruleId: 'R39', scope: order, status: 'PASS' }),
  entry('rule.evaluated', { ruleId: 'R40', scope: order, status: 'PASS' }),
]

describe('playbackSteps', () => {
  it('shows who acted on which rule, then each rule that followed', () => {
    const steps = playbackSteps(loading, 1, titles)
    expect(steps.map((step) => [step.tone, step.ruleIds, step.upTo])).toEqual([
      ['task', ['R39'], 2],
      ['rule', ['R39'], 3],
      ['rule', ['R40'], 4],
    ])
    expect(steps[0]?.text).toBe('仓库操作员 wen 完成了 R39「Loaded」的任务')
    expect(steps[2]?.text).toBe('R40「Release allowed」（整单）重新判断：通过')
  })

  it('plays the invalidations of one change as one step and a new revision once', () => {
    const steps = playbackSteps(
      [
        entry('case.submitted', { caseRevision: 2 }),
        entry('case.submitted', { caseRevision: 2 }, 'cargo-assurance'),
        entry('result.invalidated', {
          ruleId: 'R13',
          scope: order,
          previousStatus: 'PASS',
          change: 'r2 (route)',
        }),
        entry('result.invalidated', {
          ruleId: 'R40',
          scope: order,
          previousStatus: 'PASS',
          change: 'r2 (route)',
        }),
      ],
      -1,
      titles,
    )
    expect(steps.map((step) => [step.tone, step.ruleIds, step.upTo])).toEqual([
      ['info', [], 1],
      ['invalidated', ['R13', 'R40'], 3],
    ])
  })
})

describe('outcomesAt', () => {
  const live = [outcome('R39', 'PASS'), outcome('R40', 'PASS')]

  it('shows a rule as it stood before the steps not yet played', () => {
    const shown = outcomesAt(loading, 3, live)
    expect(shown.map((item) => [item.ruleId, item.status])).toEqual([
      ['R39', 'PASS'],
      ['R40', 'BLOCKED_DEPENDENCY'],
    ])
  })

  it('shows the live outcomes once every step has played', () => {
    expect(outcomesAt(loading, loading.length - 1, live)).toEqual(live)
  })

  it('returns an invalidated result that was confirmed unchanged to its status', () => {
    const entries = [
      entry('rule.evaluated', { ruleId: 'R40', scope: order, status: 'PASS' }),
      entry('result.invalidated', {
        ruleId: 'R40',
        scope: order,
        previousStatus: 'PASS',
        change: 'r2',
      }),
      entry('rule.evaluated', { ruleId: 'R39', scope: order, status: 'PASS' }),
    ]
    // R39 has not happened yet, so it is not shown; R40 is back to its status.
    const shown = outcomesAt(entries, 1, live)
    expect(shown.map((item) => [item.ruleId, item.status])).toEqual([['R40', 'PASS']])
  })
})
