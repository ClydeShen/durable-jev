import type { BranchEvaluationRequest, BranchEvaluationResult } from '@durable-jev/contracts'
import {
  buildSemanticQuestions,
  CachingJudge,
  JevJudge,
  ScriptedJudge,
  type SemanticJudge,
  semanticCacheMigrations,
} from '@durable-jev/model-providers'
import type { Migration, StoreDatabase } from '@durable-jev/store'
import {
  type BranchEvaluationDependencies,
  evaluateBranch,
  rulesOfBranches,
} from './evaluate-branch.js'

export type JudgeFor = (request: BranchEvaluationRequest) => SemanticJudge

export const scriptedJudgeFor: JudgeFor = (request) => new ScriptedJudge(request.semanticAnswers)

export const judgeMigrations: readonly Migration[] = semanticCacheMigrations

export function judgeForModelMode(
  mode: string | undefined,
  options: { apiKey?: string | undefined; cacheDatabase: StoreDatabase },
): JudgeFor {
  if (mode !== 'live') return scriptedJudgeFor
  if (!options.apiKey) throw new Error('MODEL_MODE=live needs TYPESAFE_API_KEY')
  const judge = new CachingJudge(new JevJudge({ apiKey: options.apiKey }), options.cacheDatabase)
  return () => judge
}

export async function evaluateBranchWithJudge(
  request: BranchEvaluationRequest,
  dependencies: BranchEvaluationDependencies & { judgeFor?: JudgeFor },
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
  })
  const judgements =
    questions.length > 0
      ? await (dependencies.judgeFor ?? scriptedJudgeFor)(request).ask(questions)
      : []

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
