import type { ScriptedSemanticAnswer } from '@durable-jev/contracts'
import type { SemanticJudge, SemanticJudgement } from './semantic-judge.types.js'
import type { SemanticQuestion } from './semantic-question.helpers.js'

export class ScriptedJudge implements SemanticJudge {
  readonly provider = 'scripted'
  readonly modelId = 'scripted-answers'

  constructor(private readonly answers: readonly ScriptedSemanticAnswer[]) {}

  async ask(questions: readonly SemanticQuestion[]): Promise<SemanticJudgement[]> {
    return questions.flatMap((question) => {
      const scripted = this.answers.find(
        (answer) => answer.ruleId === question.ruleId && answer.entityId === question.entityId,
      )
      if (!scripted || scripted.answer.type !== question.kind) return []
      return [
        {
          ruleId: question.ruleId,
          entityId: question.entityId,
          answer: scripted.answer,
          provider: this.provider,
          modelId: this.modelId,
        },
      ]
    })
  }
}
