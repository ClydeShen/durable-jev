import type { CheckStatus } from '@durable-jev/contracts'
import {
  type SemanticJudge,
  SemanticJudgeError,
  type SemanticJudgement,
  type SemanticQuestion,
  type SemanticState,
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
function selectedChoices(judgement: SemanticJudgement, minimum: number): string[] {
  if (judgement.kind !== 'choice') return []
  const likely = Object.entries(judgement.probabilities ?? {})
    .filter(([, probability]) => probability >= minimum)
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

function isProbability(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1
}

function validJudgement(question: SemanticQuestion, judgement: SemanticJudgement): boolean {
  if (question.kind === 'noul' && judgement.kind === 'noul')
    return isProbability(judgement.probability)
  if (question.kind !== 'choice' || judgement.kind !== 'choice') return false
  return (
    Object.hasOwn(question.options, judgement.choice) &&
    (judgement.confidence === undefined || isProbability(judgement.confidence)) &&
    Object.entries(judgement.probabilities ?? {}).every(
      ([label, value]) => Object.hasOwn(question.options, label) && isProbability(value),
    )
  )
}

export function semanticEvaluator(judge: SemanticJudge): LeafEvaluator {
  return async ({ rule, scope, facts, parameters }) => {
    const semantic = rule.semantic
    if (!semantic) throw new Error(`${rule.ruleId} has no semantic question`)
    const state = semanticState(
      semantic.state,
      feelContext(facts, scope, parameters),
    ) as SemanticState
    const question = questionFor(rule.ruleId, semantic)
    const answer = await judge.ask(question, state)
    if (!validJudgement(question, answer.judgement)) {
      throw new SemanticJudgeError(
        judge.provider,
        question.questionId,
        'invalid judgement or unsupported label',
      )
    }
    return {
      status: gateStatusOf(semantic.passWhen, answer.judgement, parameters),
      observedValue: observedValueOf(semantic.passWhen, answer.judgement, parameters),
    }
  }
}
