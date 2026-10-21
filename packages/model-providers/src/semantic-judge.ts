export type SemanticProvider = 'jev' | 'structured-output' | 'scripted'

interface QuestionIdentity {
  questionId: string
  promptVersion: string
  text: string
}

export interface ChoiceQuestion extends QuestionIdentity {
  kind: 'choice'
  options: Record<string, string>
}

export interface NoulQuestion extends QuestionIdentity {
  kind: 'noul'
}

export type SemanticQuestion = ChoiceQuestion | NoulQuestion

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type SemanticState = { [key: string]: JsonValue }

interface ChoiceJudgement {
  kind: 'choice'
  choice: string
  probabilities?: Record<string, number>
  confidence?: number
}

interface NoulJudgement {
  kind: 'noul'
  probability: number
}

export type SemanticJudgement = ChoiceJudgement | NoulJudgement

interface TokenUsage {
  inputTokens: number | null
  outputTokens: number | null
}

export interface SemanticAnswer {
  questionId: string
  promptVersion: string
  provider: SemanticProvider
  modelId: string
  inputHash: string
  judgement: SemanticJudgement
  raw: unknown
  usage: TokenUsage | 'unknown'
  durationMs: number
}

export interface SemanticJudge {
  readonly provider: SemanticProvider
  ask(question: SemanticQuestion, state: SemanticState): Promise<SemanticAnswer>
}

export class SemanticJudgeError extends Error {
  constructor(
    readonly provider: SemanticProvider,
    readonly questionId: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`${provider} could not answer ${questionId}: ${message}`, options)
    this.name = 'SemanticJudgeError'
  }
}

export function assertLiveModelMode(provider: SemanticProvider, env = process.env) {
  if (env.MODEL_MODE !== 'live') {
    throw new Error(
      `${provider} calls a real model; set MODEL_MODE=live to allow it (current: ${env.MODEL_MODE || 'scripted'})`,
    )
  }
}
