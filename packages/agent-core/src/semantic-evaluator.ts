import type { CheckStatus } from '@durable-jev/contracts'
import type {
  SemanticJudge,
  SemanticJudgement,
  SemanticQuestion,
  SemanticState,
} from '@durable-jev/model-providers'
import {
  feelContext,
  type LeafEvaluator,
  type PolicyParameters,
  type SemanticRule,
  semanticState,
} from '@durable-jev/rule-engine'

function questionFor(ruleId: string, semantic: SemanticRule): SemanticQuestion {
  const identity = {
    questionId: ruleId,
    promptVersion: semantic.promptVersion,
    text: semantic.question.text,
  }
  return semantic.question.kind === 'choice'
    ? { ...identity, kind: 'choice', options: semantic.question.options }
    : { ...identity, kind: 'noul' }
}

function threshold(value: number | string, parameters: PolicyParameters): number {
  return typeof value === 'number' ? value : Number(parameters[value])
}

/** Every label at or above the threshold, most likely first; the answer's choice at least. */
function selectedChoices(judgement: SemanticJudgement, threshold: number): string[] {
  if (judgement.kind !== 'choice') return []
  const likely = Object.entries(judgement.probabilities ?? {})
    .filter(([, probability]) => probability >= threshold)
    .sort(([, left], [, right]) => right - left)
    .map(([label]) => label)
  return likely.includes(judgement.choice) ? likely : [judgement.choice, ...likely]
}

function gateStatusOf(
  passWhen: SemanticRule['passWhen'],
  judgement: SemanticJudgement,
  parameters: PolicyParameters,
): CheckStatus {
  if ('selectChoicesAtLeast' in passWhen) return judgement.kind === 'choice' ? 'PASS' : 'ERROR'
  if ('choiceIn' in passWhen) {
    if (judgement.kind !== 'choice') return 'ERROR'
    return passWhen.choiceIn.includes(judgement.choice) ? 'PASS' : 'FAIL'
  }
  if (judgement.kind !== 'noul') return 'ERROR'
  if ('probabilityAtLeast' in passWhen) {
    return judgement.probability >= threshold(passWhen.probabilityAtLeast, parameters)
      ? 'PASS'
      : 'FAIL'
  }
  return judgement.probability <= threshold(passWhen.probabilityAtMost, parameters)
    ? 'PASS'
    : 'FAIL'
}

function observedValueOf(
  passWhen: SemanticRule['passWhen'],
  judgement: SemanticJudgement,
  parameters: PolicyParameters,
): string | number | string[] {
  if ('selectChoicesAtLeast' in passWhen) {
    return selectedChoices(judgement, threshold(passWhen.selectChoicesAtLeast, parameters))
  }
  return judgement.kind === 'choice' ? judgement.choice : judgement.probability
}

export function semanticEvaluator(judge: SemanticJudge): LeafEvaluator {
  return async ({ rule, scope, facts, parameters }) => {
    const semantic = rule.semantic
    if (!semantic) throw new Error(`${rule.ruleId} has no semantic question`)
    const state = semanticState(
      semantic.state,
      feelContext(facts, scope, parameters),
    ) as SemanticState
    const answer = await judge.ask(questionFor(rule.ruleId, semantic), state)
    return {
      status: gateStatusOf(semantic.passWhen, answer.judgement, parameters),
      observedValue: observedValueOf(semantic.passWhen, answer.judgement, parameters),
    }
  }
}
