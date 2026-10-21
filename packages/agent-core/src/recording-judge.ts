import type {
  SemanticAnswer,
  SemanticJudge,
  SemanticQuestion,
  SemanticState,
} from '@durable-jev/model-providers'

export class RecordingJudge implements SemanticJudge {
  readonly answers: SemanticAnswer[] = []

  constructor(private readonly inner: SemanticJudge) {}

  get provider() {
    return this.inner.provider
  }

  async ask(question: SemanticQuestion, state: SemanticState): Promise<SemanticAnswer> {
    const answer = await this.inner.ask(question, state)
    this.answers.push(answer)
    return answer
  }
}
