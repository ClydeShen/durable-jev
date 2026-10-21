import { describe, expect, it } from 'vitest'
import { JevJudge, pinnedJevModel } from './jev.judge.js'

const recordedFetch = (answer: unknown, requests: unknown[] = []) => {
  return async (_url: string, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)))
    return new Response(
      JSON.stringify({
        model: pinnedJevModel,
        answers: { answer },
        usage: { input_tokens: 120, output_tokens: 20 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }
}

describe('JevJudge', () => {
  it('sends each question with only its own state and maps a choice answer', async () => {
    const requests: unknown[] = []
    const judge = new JevJudge({
      apiKey: 'recorded',
      fetch: recordedFetch(
        {
          type: 'choice',
          choice: 'damaged_packaging',
          probabilities: { damaged_packaging: 0.85, no_risk: 0.15 },
          confidence: 0.7,
        },
        requests,
      ),
    })
    const [judgement] = await judge.ask([
      {
        ruleId: 'R18',
        entityId: 'ITEM-1',
        kind: 'choice',
        prompt: 'Which risk signal does the note show?',
        options: { no_risk: 'none', damaged_packaging: 'damage' },
        state: { inspectionNote: 'Carton crushed' },
      },
    ])
    expect(judgement).toEqual({
      ruleId: 'R18',
      entityId: 'ITEM-1',
      answer: {
        type: 'choice',
        choice: 'damaged_packaging',
        probabilities: { damaged_packaging: 0.85, no_risk: 0.15 },
      },
      provider: 'jev',
      modelId: pinnedJevModel,
    })
    expect(requests[0]).toMatchObject({
      model: pinnedJevModel,
      state: { inspectionNote: 'Carton crushed' },
    })
  })

  it('maps a noul answer', async () => {
    const judge = new JevJudge({
      apiKey: 'recorded',
      fetch: recordedFetch({ type: 'noul', noul: 0.05 }),
    })
    const [judgement] = await judge.ask([
      {
        ruleId: 'R10',
        entityId: 'ITEM-1',
        kind: 'noul',
        prompt: 'Same goods?',
        state: { description: 'x' },
      },
    ])
    expect(judgement?.answer).toEqual({ type: 'noul', noul: 0.05 })
  })

  it('does not retry a failed call itself', async () => {
    let calls = 0
    const judge = new JevJudge({
      apiKey: 'recorded',
      fetch: async () => {
        calls += 1
        return new Response('overloaded', { status: 503 })
      },
    })
    await expect(
      judge.ask([
        {
          ruleId: 'R03',
          entityId: 'ITEM-1',
          kind: 'noul',
          prompt: 'Matches?',
          state: { description: 'x' },
        },
      ]),
    ).rejects.toThrow()
    expect(calls).toBe(1)
  })
})
