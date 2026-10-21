import type { SemanticAnswer } from '@durable-jev/contracts'
import { choice, noul, TypeSafeClient } from '@typesafe-ai/sdk'
import type { SemanticJudge, SemanticJudgement } from './semantic-judge.types.js'
import type { SemanticQuestion } from './semantic-question.helpers.js'

export const pinnedJevModel = 'jev-1.14.0'

type JevAnswer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; probabilities: Record<string, number> }

export class JevJudge implements SemanticJudge {
  readonly provider = 'jev'
  readonly modelId: string
  private readonly client: TypeSafeClient

  constructor(
    options: {
      apiKey?: string
      modelId?: string
      timeoutMs?: number
      fetch?: (input: string, init?: RequestInit) => Promise<Response>
    } = {},
  ) {
    this.modelId = options.modelId ?? pinnedJevModel
    this.client = new TypeSafeClient({
      defaultModel: this.modelId,
      ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      timeout: options.timeoutMs ?? 10_000,
      retry: { maxRetries: 0 },
      compression: false,
    })
  }

  ask(questions: readonly SemanticQuestion[]): Promise<SemanticJudgement[]> {
    return Promise.all(questions.map((question) => this.askOne(question)))
  }

  private async askOne(question: SemanticQuestion): Promise<SemanticJudgement> {
    const sdkQuestion =
      question.kind === 'noul'
        ? noul(question.prompt)
        : choice(question.prompt, question.options ?? {})
    const result = await this.client.systemOne({
      state: question.state,
      questions: { answer: sdkQuestion },
    })
    return {
      ruleId: question.ruleId,
      entityId: question.entityId,
      answer: toSemanticAnswer(result.answers.answer as unknown as JevAnswer),
      provider: this.provider,
      modelId: result.model,
    }
  }
}

function toSemanticAnswer(answer: JevAnswer): SemanticAnswer {
  return answer.type === 'noul'
    ? { type: 'noul', noul: answer.noul }
    : { type: 'choice', choice: answer.choice, probabilities: answer.probabilities }
}
