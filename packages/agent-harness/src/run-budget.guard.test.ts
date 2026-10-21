import { describe, expect, it } from 'vitest'
import { defaultRunBudget, RunBudgetGuard } from './run-budget-guard.js'

const clock = (start = 0) => {
  let now = start
  return { now: () => now, advance: (ms: number) => (now += ms) }
}

describe('RunBudgetGuard', () => {
  it('allows ten tool calls and stops the eleventh', () => {
    const guard = RunBudgetGuard.start(defaultRunBudget, clock().now)
    for (let call = 0; call < 10; call++) expect(guard.beforeToolCall()).toEqual({ allowed: true })
    expect(guard.beforeToolCall()).toMatchObject({ allowed: false, limit: 'toolCalls' })
  })

  it('limits model retries and follow-up rounds separately', () => {
    const guard = RunBudgetGuard.start(defaultRunBudget, clock().now)
    for (let retry = 0; retry < 3; retry++) guard.beforeModelRetry()
    expect(guard.beforeModelRetry()).toMatchObject({ allowed: false, limit: 'modelRetries' })
    guard.beforeFollowUpRound()
    guard.beforeFollowUpRound()
    expect(guard.beforeFollowUpRound()).toMatchObject({ allowed: false, limit: 'followUpRounds' })
    expect(guard.beforeToolCall()).toEqual({ allowed: true })
  })

  it('flags the 30 s target and hard stops after 60 s', () => {
    const time = clock()
    const guard = RunBudgetGuard.start(defaultRunBudget, time.now)
    time.advance(31_000)
    expect(guard.overTarget()).toBe(true)
    expect(guard.beforeToolCall()).toEqual({ allowed: true })
    time.advance(30_000)
    expect(guard.beforeToolCall()).toMatchObject({ allowed: false, limit: 'time' })
  })

  it('counts restarts across crashes through the persisted state', () => {
    const time = clock()
    let state = RunBudgetGuard.start(defaultRunBudget, time.now).snapshot()
    const decisions = []
    for (let crash = 0; crash < 3; crash++) {
      // Each restart is a new process: only the persisted snapshot carries over.
      const guard = RunBudgetGuard.restore(state, defaultRunBudget, time.now)
      decisions.push(guard.beforeRestart())
      state = guard.snapshot()
    }
    expect(decisions.map((decision) => decision.allowed)).toEqual([true, true, false])
    expect(decisions[2]).toMatchObject({ limit: 'restarts' })
  })

  it('keeps the wall clock running across a restart', () => {
    const time = clock()
    const state = RunBudgetGuard.start(defaultRunBudget, time.now).snapshot()
    time.advance(61_000)
    const restored = RunBudgetGuard.restore(state, defaultRunBudget, time.now)
    expect(restored.beforeRestart()).toMatchObject({ allowed: false, limit: 'time' })
  })
})
