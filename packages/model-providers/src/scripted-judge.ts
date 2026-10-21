import { semanticInputHash } from './input-hash.js'
import {
  type SemanticAnswer,
  type SemanticJudge,
  SemanticJudgeError,
  type SemanticJudgement,
  type SemanticQuestion,
  type SemanticState,
} from './semantic-judge.js'

export interface ScriptedJudgement {
  questionId: string
  inputHash?: string
  stateIncludes?: string
  judgement: SemanticJudgement
}

export class ScriptedJudge implements SemanticJudge {
  readonly provider = 'scripted'
  readonly modelId = 'scripted'

  constructor(private readonly script: readonly ScriptedJudgement[]) {}

  async ask(question: SemanticQuestion, state: SemanticState): Promise<SemanticAnswer> {
    const inputHash = semanticInputHash(question, state)
    const entry = this.findEntry(question.questionId, inputHash, state)
    if (!entry) {
      throw new SemanticJudgeError(this.provider, question.questionId, `no script for ${inputHash}`)
    }
    return {
      questionId: question.questionId,
      promptVersion: question.promptVersion,
      provider: this.provider,
      modelId: this.modelId,
      inputHash,
      judgement: entry.judgement,
      raw: entry.judgement,
      usage: 'unknown',
      durationMs: 0,
    }
  }

  private findEntry(
    questionId: string,
    inputHash: string,
    state: SemanticState,
  ): ScriptedJudgement | undefined {
    const forQuestion = this.script.filter((entry) => entry.questionId === questionId)
    const serializedState = JSON.stringify(state)
    return (
      forQuestion.find((entry) => entry.inputHash === inputHash) ??
      forQuestion.find(
        (entry) =>
          entry.stateIncludes !== undefined && serializedState.includes(entry.stateIncludes),
      ) ??
      forQuestion.find(
        (entry) => entry.inputHash === undefined && entry.stateIncludes === undefined,
      )
    )
  }
}
