import { APIConnectionError, APIError } from '@typesafe-ai/sdk'
import type { SemanticJudge, SemanticJudgement } from './semantic-judge.types.js'
import type { SemanticQuestion } from './semantic-question.helpers.js'

export class JudgeUnavailableError extends Error {
  constructor(
    readonly provider: string,
    readonly attempts: number,
    reason: string,
  ) {
    super(`${provider} unavailable after ${attempts} attempt(s): ${reason}`)
  }
}

// Timeouts, lost connections, 408, 429 and 5xx may pass on retry; a bad key or a bad request
// will not, so those fail at once.
export function isTransient(error: unknown): boolean {
  if (error instanceof APIError)
    return error.status === 408 || error.status === 429 || error.status >= 500
  return error instanceof APIConnectionError
}

export type RetryOptions = {
  maxAttempts?: number
  baseDelayMs?: number
  sleep?: (ms: number) => Promise<void>
  isTransient?: (error: unknown) => boolean
}

// The SDK's own retries are off, so every retry happens here, is counted and has a limit.
// When the limit is reached the caller gets JudgeUnavailableError, never a guessed answer.
export class RetryingJudge implements SemanticJudge {
  readonly provider: string
  readonly modelId: string
  private readonly maxAttempts: number
  private readonly baseDelayMs: number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly transient: (error: unknown) => boolean

  constructor(
    private readonly inner: SemanticJudge,
    options: RetryOptions = {},
  ) {
    this.provider = inner.provider
    this.modelId = inner.modelId
    this.maxAttempts = options.maxAttempts ?? 3
    this.baseDelayMs = options.baseDelayMs ?? 250
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.transient = options.isTransient ?? isTransient
  }

  async ask(questions: readonly SemanticQuestion[]): Promise<SemanticJudgement[]> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.inner.ask(questions)
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        if (!this.transient(error) || attempt >= this.maxAttempts) {
          throw new JudgeUnavailableError(this.provider, attempt, reason)
        }
        await this.sleep(this.baseDelayMs * 2 ** (attempt - 1))
      }
    }
  }
}
