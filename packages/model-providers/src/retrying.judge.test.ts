import { APITimeoutError, AuthenticationError, RateLimitError } from '@typesafe-ai/sdk'
import { describe, expect, it } from 'vitest'
import { JudgeUnavailableError, RetryingJudge } from './retrying-judge.js'
import type { SemanticJudge } from './semantic-judge.js'

function flakyJudge(failures: unknown[]) {
  const calls = { count: 0 }
  const judge: SemanticJudge = {
    provider: 'jev',
    modelId: 'jev-1.14.0',
    ask: async () => {
      calls.count += 1
      const failure = failures.shift()
      if (failure) throw failure
      return []
    },
  }
  return { judge, calls }
}

const noWait = { sleep: async () => {} }
const rateLimited = () => new RateLimitError(429, {}, new Headers(), 'rate limited')

describe('RetryingJudge', () => {
  it('retries transient failures with growing waits and then answers', async () => {
    const waits: number[] = []
    const { judge, calls } = flakyJudge([rateLimited(), new APITimeoutError()])
    const retrying = new RetryingJudge(judge, {
      baseDelayMs: 100,
      sleep: async (ms) => {
        waits.push(ms)
      },
    })
    expect(await retrying.ask([])).toEqual([])
    expect(calls.count).toBe(3)
    expect(waits).toEqual([100, 200])
  })

  it('gives up after the attempt limit with a clear technical error', async () => {
    const { judge, calls } = flakyJudge([
      rateLimited(),
      rateLimited(),
      rateLimited(),
      rateLimited(),
    ])
    await expect(new RetryingJudge(judge, noWait).ask([])).rejects.toBeInstanceOf(
      JudgeUnavailableError,
    )
    expect(calls.count).toBe(3)
  })

  it('does not retry a failure that cannot pass, such as a bad key', async () => {
    const { judge, calls } = flakyJudge([
      new AuthenticationError(401, {}, new Headers(), 'bad key'),
    ])
    await expect(new RetryingJudge(judge, noWait).ask([])).rejects.toMatchObject({ attempts: 1 })
    expect(calls.count).toBe(1)
  })
})
