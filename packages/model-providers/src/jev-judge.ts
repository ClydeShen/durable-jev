import {
  type ChoiceResponse,
  type Fetch,
  type NoulResponse,
  TypeSafeClient,
} from '@typesafe-ai/sdk'
import { semanticInputHash } from './input-hash.js'
import {
  assertLiveModelMode,
  type SemanticAnswer,
  type SemanticJudge,
  SemanticJudgeError,
  type SemanticJudgement,
  type SemanticQuestion,
  type SemanticState,
} from './semantic-judge.js'

export const pinnedJevModel = 'jev-1.14.0'

export interface JevJudgeOptions {
  apiKey?: string
  model?: string
  timeoutMs?: number
  fetch?: Fetch
}

type JevQuestion =
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'noul'; instructions: string }

function toJevQuestion(question: SemanticQuestion): JevQuestion {
  return question.kind === 'choice'
    ? { type: 'choice', instructions: question.text, criteria: question.options }
    : { type: 'noul', instructions: question.text }
}

function toJudgement(response: ChoiceResponse | NoulResponse): SemanticJudgement {
  return response.type === 'choice'
    ? {
        kind: 'choice',
        choice: response.choice,
        probabilities: { ...response.probabilities },
        confidence: response.confidence,
      }
    : { kind: 'noul', probability: response.noul }
}

export class JevJudge implements SemanticJudge {
  readonly provider = 'jev'
  readonly modelId: string
  private readonly client: TypeSafeClient

  constructor(options: JevJudgeOptions = {}) {
    if (!options.fetch) assertLiveModelMode('jev')
    this.modelId = options.model ?? pinnedJevModel
    this.client = new TypeSafeClient({
      apiKey: options.apiKey,
      defaultModel: this.modelId,
      timeout: options.timeoutMs ?? 10_000,
      retry: { maxRetries: 0 },
      compression: false,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    })
  }

  async ask(question: SemanticQuestion, state: SemanticState): Promise<SemanticAnswer> {
    const startedAt = performance.now()
    const result = await this.client
      .systemOne({ state, questions: { answer: toJevQuestion(question) } })
      .catch((error: unknown) => {
        throw new SemanticJudgeError(this.provider, question.questionId, String(error), {
          cause: error,
        })
      })
    const raw = result.answers.answer
    if (raw.type !== question.kind) {
      throw new SemanticJudgeError(this.provider, question.questionId, `got ${raw.type} answer`)
    }
    return {
      questionId: question.questionId,
      promptVersion: question.promptVersion,
      provider: this.provider,
      modelId: result.model,
      inputHash: semanticInputHash(question, state),
      judgement: toJudgement(raw as ChoiceResponse | NoulResponse),
      raw,
      usage: { inputTokens: result.usage.input_tokens, outputTokens: result.usage.output_tokens },
      durationMs: Math.round(performance.now() - startedAt),
    }
  }
}
