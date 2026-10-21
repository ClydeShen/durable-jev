import type { SemanticAnswer } from '@durable-jev/contracts'
import type { SemanticQuestion } from './semantic-question.helpers.js'

export type SemanticJudgement = {
  ruleId: string
  entityId: string
  answer: SemanticAnswer
  provider: string
  modelId: string
}

export interface SemanticJudge {
  readonly provider: string
  readonly modelId: string
  ask(questions: readonly SemanticQuestion[]): Promise<SemanticJudgement[]>
}
