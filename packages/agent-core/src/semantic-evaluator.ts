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

function gateStatusOf(
  passWhen: SemanticRule['passWhen'],
  judgement: SemanticJudgement,
  parameters: PolicyParameters,
): CheckStatus {
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

function observedValueOf(judgement: SemanticJudgement): string | number {
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
      observedValue: observedValueOf(answer.judgement),
    }
  }
}
