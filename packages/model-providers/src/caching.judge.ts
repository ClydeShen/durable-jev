import { createHash } from 'node:crypto'
import type { Migration, StoreDatabase } from '@durable-jev/store'
import type { SemanticJudge, SemanticJudgement } from './semantic-judge.types.js'
import type { SemanticQuestion } from './semantic-question.helpers.js'

export const semanticCacheMigrations: readonly Migration[] = [
  {
    id: 'semantic-001-cache',
    sql: `CREATE TABLE semantic_cache (
      cache_key TEXT PRIMARY KEY,
      judgement_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
  },
]

export class CachingJudge implements SemanticJudge {
  readonly provider: string
  readonly modelId: string

  constructor(
    private readonly inner: SemanticJudge,
    private readonly database: StoreDatabase,
  ) {
    this.provider = inner.provider
    this.modelId = inner.modelId
  }

  async ask(questions: readonly SemanticQuestion[]): Promise<SemanticJudgement[]> {
    const keyed = questions.map((question) => ({ question, key: this.cacheKey(question) }))
    const cached = new Map(
      keyed.flatMap(({ question, key }) => {
        const judgement = this.read(key)
        return judgement
          ? [[key, { ...judgement, ruleId: question.ruleId, entityId: question.entityId }]]
          : []
      }),
    )
    const missing = keyed.filter(({ key }) => !cached.has(key))
    const fresh =
      missing.length > 0 ? await this.inner.ask(missing.map(({ question }) => question)) : []
    for (const judgement of fresh) {
      const entry = missing.find(
        ({ question }) =>
          question.ruleId === judgement.ruleId && question.entityId === judgement.entityId,
      )
      if (entry) this.write(entry.key, judgement)
    }
    return [...cached.values(), ...fresh]
  }

  private cacheKey(question: SemanticQuestion): string {
    const { ruleId: _ruleId, entityId: _entityId, ...content } = question
    return createHash('sha256')
      .update(JSON.stringify({ modelId: this.modelId, ...content }))
      .digest('hex')
  }

  private read(key: string): SemanticJudgement | undefined {
    const row = this.database
      .prepare('SELECT judgement_json FROM semantic_cache WHERE cache_key = ?')
      .get(key) as { judgement_json: string } | undefined
    return row && JSON.parse(row.judgement_json)
  }

  private write(key: string, judgement: SemanticJudgement): void {
    this.database
      .prepare(
        `INSERT INTO semantic_cache (cache_key, judgement_json, created_at) VALUES (?, ?, ?)
         ON CONFLICT (cache_key) DO NOTHING`,
      )
      .run(key, JSON.stringify(judgement), new Date().toISOString())
  }
}
