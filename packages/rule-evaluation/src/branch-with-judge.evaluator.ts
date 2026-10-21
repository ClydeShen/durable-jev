import { createHash } from 'node:crypto'
import type { BranchEvaluationRequest, BranchEvaluationResult } from '@durable-jev/contracts'
import {
  buildSemanticQuestions,
  CachingJudge,
  JevJudge,
  JudgeUnavailableError,
  RetryingJudge,
  ScriptedJudge,
  type SemanticJudge,
  semanticCacheMigrations,
} from '@durable-jev/model-providers'
import type { Migration, StoreDatabase } from '@durable-jev/store'
import { type Telemetry, withSpan } from '@durable-jev/telemetry'
import {
  type BranchEvaluationDependencies,
  evaluateBranch,
  rulesOfBranches,
} from './branch.evaluator.js'

export { JudgeUnavailableError }

export type JudgeFor = (request: BranchEvaluationRequest) => SemanticJudge

export const scriptedJudgeFor: JudgeFor = (request) => new ScriptedJudge(request.semanticAnswers)

export const judgeMigrations: readonly Migration[] = semanticCacheMigrations

export function judgeForModelMode(
  mode: string | undefined,
  options: { apiKey?: string | undefined; cacheDatabase: StoreDatabase },
): JudgeFor {
  if (mode !== 'live') return scriptedJudgeFor
  if (!options.apiKey) throw new Error('MODEL_MODE=live needs TYPESAFE_API_KEY')
  // Only cache misses reach Jev, and only those are retried.
  const judge = new CachingJudge(
    new RetryingJudge(new JevJudge({ apiKey: options.apiKey })),
    options.cacheDatabase,
  )
  return () => judge
}

export async function evaluateBranchWithJudge(
  request: BranchEvaluationRequest,
  dependencies: BranchEvaluationDependencies & { judgeFor?: JudgeFor; telemetry?: Telemetry },
): Promise<BranchEvaluationResult> {
  const semanticRuleIds = new Set<string>(
    rulesOfBranches(dependencies.configuration.rulesInEvaluationOrder, dependencies.branches)
      .filter((rule) => rule.evaluator.kind === 'semantic')
      .map((rule) => rule.ruleId),
  )
  const questions = buildSemanticQuestions({
    templates: dependencies.configuration.semanticQuestions,
    ruleIds: semanticRuleIds,
    shipment: request.shipment,
    evidence: request.evidence,
    glossary: {
      referenceData: dependencies.referenceData,
      categoryDefinitions: dependencies.configuration.categoryDefinitions,
    },
  })
  const judge = (dependencies.judgeFor ?? scriptedJudgeFor)(request)
  const telemetry = dependencies.telemetry
  const caseFields = { caseId: request.caseId as string, caseRevision: request.caseRevision }
  for (const question of questions) {
    telemetry?.emit({
      eventName: 'jev.requested',
      ...caseFields,
      attributes: {
        ruleId: question.ruleId,
        entityId: question.entityId,
        kind: question.kind,
        provider: judge.provider,
        modelId: judge.modelId,
        // A hash stands in for the text: the observation store never keeps case documents.
        inputHash: createHash('sha256').update(JSON.stringify(question)).digest('hex').slice(0, 16),
      },
    })
  }
  const startedAt = Date.now()
  let judgements: Awaited<ReturnType<typeof judge.ask>> = []
  if (questions.length > 0) {
    try {
      judgements = await withSpan(
        'jev.ask',
        {
          caseId: caseFields.caseId,
          caseRevision: caseFields.caseRevision,
          attributes: {
            provider: judge.provider,
            modelId: judge.modelId,
            questions: questions.length,
          },
        },
        () => judge.ask(questions),
      )
    } catch (error) {
      telemetry?.emit({
        eventName: 'task.failed',
        ...caseFields,
        errorCode: 'JUDGE_UNAVAILABLE',
        durationMs: Date.now() - startedAt,
        attributes: { provider: judge.provider, modelId: judge.modelId, message: String(error) },
      })
      throw error
    }
  }
  for (const judgement of judgements) {
    telemetry?.emit({
      eventName: 'jev.completed',
      ...caseFields,
      durationMs: Date.now() - startedAt,
      attributes: {
        ruleId: judgement.ruleId,
        entityId: judgement.entityId,
        provider: judgement.provider,
        modelId: judgement.modelId,
        // What the model returned, kept apart from what the rule makes of it.
        answer: judgement.answer,
      },
    })
  }

  const result = evaluateBranch(
    {
      ...request,
      semanticAnswers: judgements.map((judgement) => ({
        ruleId: judgement.ruleId as never,
        entityId: judgement.entityId,
        answer: judgement.answer,
      })),
    },
    dependencies,
  )
  const provenance = new Map(
    judgements.map((judgement) => [
      `${judgement.ruleId}@${judgement.entityId}`,
      { provider: judgement.provider, modelId: judgement.modelId },
    ]),
  )
  return {
    ...result,
    evaluations: result.evaluations.map((evaluation) => {
      const source = provenance.get(`${evaluation.ruleId}@${evaluation.subject.entityId}`)
      if (!source) return evaluation
      const observed =
        evaluation.observedValue && typeof evaluation.observedValue === 'object'
          ? evaluation.observedValue
          : {}
      return { ...evaluation, observedValue: { ...observed, ...source } }
    }),
  }
}
