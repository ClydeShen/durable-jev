import type { HumanTask } from '@durable-jev/contracts'
import { describe, expect, it } from 'vitest'
import { currentStepIndex, type GuideState, scenarioFor, scenarios } from './scenarios.model.js'

const task = (ruleId: string, status: string, createdAt: string) =>
  ({ ruleId, status, createdAt, humanTaskId: `${ruleId}-${createdAt}` }) as unknown as HumanTask

const state = (overrides: Partial<GuideState> = {}): GuideState => ({
  orderStatus: 'AWAITING_HUMAN',
  humanTasks: [],
  checks: [],
  changes: [],
  investigations: [],
  ...overrides,
})

describe('guided scenarios', () => {
  it('has a scenario for each workbench order', () => {
    expect(scenarios.map((scenario) => scenario.shipmentId)).toEqual([
      'LOG-001',
      'LOG-002',
      'LOG-003',
      'LOG-004',
      'LOG-005',
      'LOG-006',
      'LOG-007',
      'LOG-008',
    ])
  })

  it('gives every step an instruction and an expected result', () => {
    for (const scenario of scenarios)
      for (const step of scenario.steps) {
        expect(step.instruction.length, `${scenario.shipmentId}/${step.id}`).toBeGreaterThan(10)
        expect(step.expect.length, `${scenario.shipmentId}/${step.id}`).toBeGreaterThan(10)
      }
  })

  it('moves to the next step from the order itself, not from clicks', () => {
    const scenario = scenarioFor('LOG-001')
    if (!scenario) throw new Error('missing scenario')
    const acknowledged = new Set(['read', 'wrong-role', 'race'])
    expect(currentStepIndex(scenario, state(), acknowledged)).toBe(3)
    expect(
      currentStepIndex(
        scenario,
        state({ humanTasks: [task('R39-LOAD', 'COMPLETED', '2026-01-01T00:00:00Z')] }),
        acknowledged,
      ),
    ).toBe(4)
    expect(
      currentStepIndex(scenario, state({ orderStatus: 'DISPATCHED' }), new Set(['read'])),
    ).toBe(1)
  })

  it('treats a sign-off asked for again as a new step', () => {
    const scenario = scenarioFor('LOG-004')
    if (!scenario) throw new Error('missing scenario')
    const first = {
      ...task('R13', 'SUPERSEDED', '2026-01-01T00:00:00Z'),
      decision: { outcome: 'APPROVED' },
    } as unknown as HumanTask
    const approvedOnce = state({
      humanTasks: [task('R13', 'APPROVED', '2026-01-01T00:00:00Z')],
    })
    expect(currentStepIndex(scenario, approvedOnce, new Set())).toBe(1)
    const asked = state({
      humanTasks: [first, task('R13', 'OPEN', '2026-01-02T00:00:00Z')],
      investigations: [{ status: 'ACCEPTED' }] as GuideState['investigations'],
    })
    expect(currentStepIndex(scenario, asked, new Set())).toBe(3)
    expect(
      currentStepIndex(
        scenario,
        { ...asked, humanTasks: [first, task('R13', 'APPROVED', '2026-01-02T00:00:00Z')] },
        new Set(),
      ),
    ).toBe(4)
  })
})
