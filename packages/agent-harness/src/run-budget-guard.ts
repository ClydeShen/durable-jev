export type RunBudget = {
  maxToolCalls: number
  maxModelRetries: number
  maxFollowUpRounds: number
  maxRestarts: number
  targetMs: number
  hardStopMs: number
}

export const defaultRunBudget: RunBudget = {
  maxToolCalls: 10,
  maxModelRetries: 3,
  maxFollowUpRounds: 2,
  maxRestarts: 2,
  targetMs: 30_000,
  hardStopMs: 60_000,
}

export type BudgetLimit = 'toolCalls' | 'modelRetries' | 'followUpRounds' | 'restarts' | 'time'

// Persisted next to the run, outside the runtime: Pi Durable 1.3.0 has no restart limit,
// so a crash loop is only caught if the restart count survives the crash.
export type RunBudgetState = {
  startedAtMs: number
  toolCalls: number
  modelRetries: number
  followUpRounds: number
  restarts: number
}

export type BudgetDecision =
  | { allowed: true }
  | { allowed: false; limit: BudgetLimit; detail: string }

const allowed: BudgetDecision = { allowed: true }

export class RunBudgetGuard {
  private constructor(
    private readonly budget: RunBudget,
    private readonly state: RunBudgetState,
    private readonly now: () => number,
  ) {}

  static start(budget: RunBudget = defaultRunBudget, now: () => number = Date.now) {
    return new RunBudgetGuard(
      budget,
      { startedAtMs: now(), toolCalls: 0, modelRetries: 0, followUpRounds: 0, restarts: 0 },
      now,
    )
  }

  static restore(
    state: RunBudgetState,
    budget: RunBudget = defaultRunBudget,
    now: () => number = Date.now,
  ) {
    return new RunBudgetGuard(budget, { ...state }, now)
  }

  snapshot(): RunBudgetState {
    return { ...this.state }
  }

  elapsedMs(): number {
    return this.now() - this.state.startedAtMs
  }

  overTarget(): boolean {
    return this.elapsedMs() > this.budget.targetMs
  }

  checkTime(): BudgetDecision {
    const elapsed = this.elapsedMs()
    return elapsed > this.budget.hardStopMs
      ? {
          allowed: false,
          limit: 'time',
          detail: `${elapsed} ms exceeds ${this.budget.hardStopMs} ms`,
        }
      : allowed
  }

  beforeToolCall(): BudgetDecision {
    return this.consume('toolCalls', this.budget.maxToolCalls)
  }

  beforeModelRetry(): BudgetDecision {
    return this.consume('modelRetries', this.budget.maxModelRetries)
  }

  beforeFollowUpRound(): BudgetDecision {
    return this.consume('followUpRounds', this.budget.maxFollowUpRounds)
  }

  // Called when a run is resumed after its process died; the wall clock keeps running.
  beforeRestart(): BudgetDecision {
    return this.consume('restarts', this.budget.maxRestarts)
  }

  private consume(
    counter: Exclude<keyof RunBudgetState, 'startedAtMs'> & BudgetLimit,
    max: number,
  ): BudgetDecision {
    const time = this.checkTime()
    if (!time.allowed) return time
    if (this.state[counter] >= max) {
      return { allowed: false, limit: counter, detail: `${counter} limit of ${max} reached` }
    }
    this.state[counter] += 1
    return allowed
  }
}
