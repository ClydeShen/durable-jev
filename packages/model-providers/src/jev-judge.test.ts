import { describe, expect, it } from 'vitest'
import { documentMatchQuestion, inspectionState, packagingRiskQuestion } from './fixtures.js'
import { JevJudge, pinnedJevModel } from './jev-judge.js'
import { SemanticJudgeError } from './semantic-judge.js'

function recordedFetch(status: number, body: unknown) {
  const requests: unknown[] = []
  const fetch = async (_url: string, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)))
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }
  return { fetch, requests }
}

const usage = { input_tokens: 412, output_tokens: 77 }

describe('JevJudge', () => {
  it('asks a choice question on the pinned model and keeps the raw answer', async () => {
    const raw = {
      type: 'choice',
      choice: 'damaged_packaging',
      probabilities: { no_risk: 0.04, damaged_packaging: 0.83, cold_chain_risk: 0.13 },
      confidence: 0.79,
    }
    const { fetch, requests } = recordedFetch(200, {
      model: pinnedJevModel,
      answers: { answer: raw },
      usage,
    })
    const answer = await new JevJudge({ apiKey: 'recorded', fetch }).ask(
      packagingRiskQuestion,
      inspectionState,
    )
    expect(requests[0]).toMatchObject({
      model: pinnedJevModel,
      state: inspectionState,
      questions: { answer: { type: 'choice', criteria: packagingRiskQuestion.options } },
    })
    expect(answer.judgement).toEqual({
      kind: 'choice',
      choice: 'damaged_packaging',
      probabilities: raw.probabilities,
      confidence: 0.79,
    })
    expect(answer.raw).toEqual(raw)
    expect(answer.usage).toEqual({ inputTokens: 412, outputTokens: 77 })
  })

  it('maps a noul answer to a probability without inventing a confidence', async () => {
    const { fetch } = recordedFetch(200, {
      model: pinnedJevModel,
      answers: { answer: { type: 'noul', noul: 0.12 } },
      usage,
    })
    const answer = await new JevJudge({ apiKey: 'recorded', fetch }).ask(
      documentMatchQuestion,
      inspectionState,
    )
    expect(answer.judgement).toEqual({ kind: 'noul', probability: 0.12 })
  })

  it('leaves retries to the harness', async () => {
    const { fetch, requests } = recordedFetch(429, { error: { message: 'rate limited' } })
    await expect(
      new JevJudge({ apiKey: 'recorded', fetch }).ask(documentMatchQuestion, inspectionState),
    ).rejects.toBeInstanceOf(SemanticJudgeError)
    expect(requests).toHaveLength(1)
  })
})
