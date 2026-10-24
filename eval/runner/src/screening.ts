import { readFileSync } from 'node:fs'
import { type RulePack, semanticEvaluator } from '@durable-jev/agent-core'
import type { ScriptedJudgement, SemanticJudge } from '@durable-jev/model-providers'
import { RuleIndex, type SelectionProfile } from '@durable-jev/rule-engine'

interface ScreeningItem {
  description: string
  declaredCategories: string[]
  scriptedAnswer: ScriptedJudgement['judgement']
}

export interface ScreeningSample {
  sampleId: string
  destinationCountry: string
  customerId: string
  cargoItems: ScreeningItem[]
  expectedGroups: string[]
}

export interface ScreeningResult {
  sampleId: string
  selectedGroups: string[]
  selectedRules: number
  filteredRules: number
  missed: string[]
  extra: string[]
}

export function loadScreeningSamples(path: string): ScreeningSample[] {
  return (JSON.parse(readFileSync(path, 'utf8')) as { samples: ScreeningSample[] }).samples
}

export function scriptedAnswers(
  sample: ScreeningSample,
  classifierId: string,
): ScriptedJudgement[] {
  return sample.cargoItems.map((item) => ({
    questionId: classifierId,
    stateIncludes: item.description,
    judgement: item.scriptedAnswer,
  }))
}

/** Classifies a sample's cargo with the rule pack's classifier and compares the selected rules. */
export async function screenSample(
  sample: ScreeningSample,
  rulePack: RulePack,
  judge: SemanticJudge,
): Promise<ScreeningResult> {
  const { ruleSet, parameters } = rulePack
  const classifier = ruleSet.rules.find(
    (rule) => rule.ruleId === ruleSet.selection?.classifierRuleId,
  )
  if (!classifier) throw new Error('the rule pack has no classifier')
  const cargoItems = sample.cargoItems.map((item, index) => ({
    cargoItemId: `ITEM-${index + 1}`,
    facts: { description: item.description, declaredCategories: item.declaredCategories },
  }))
  const facts = {
    entityVersions: {},
    root: {
      scope: { kind: 'order' as const },
      facts: { destinationCountry: sample.destinationCountry, customerId: sample.customerId },
    },
    context: { cargoItems: cargoItems.map((item) => item.facts) },
    collections: {
      cargoItem: cargoItems.map((item) => ({
        scope: { kind: 'cargoItem' as const, cargoItemId: item.cargoItemId },
        facts: item.facts,
        context: { item: item.facts },
      })),
    },
  }
  const classify = semanticEvaluator(judge)
  const evaluations = await Promise.all(
    cargoItems.map((item) =>
      classify({
        rule: classifier,
        scope: { kind: 'cargoItem', cargoItemId: item.cargoItemId },
        facts,
        scopeFacts: item.facts,
        parameters,
        inputFingerprint: 'screening',
        resultOf: () => undefined,
        holds: () => ({ status: 'PASS', blockedBy: [] }),
      }),
    ),
  )
  const selectedGroups = [
    ...new Set(evaluations.flatMap((evaluation) => evaluation.observedValue as string[])),
  ]
  const ruleIndex = new RuleIndex(ruleSet.rules)
  const extensionRules = ruleSet.rules.filter((rule) => rule.applicability)
  const selectedBy = (groups: string[]) => {
    const profile: SelectionProfile = {
      destinations: [sample.destinationCountry],
      customers: [sample.customerId],
      commodityGroups: new Set(groups),
    }
    return new Set(
      extensionRules
        .filter((rule) => ruleIndex.decide(rule.ruleId, profile) === 'selected')
        .map((rule) => rule.ruleId),
    )
  }
  const [selected, expected] = [selectedBy(selectedGroups), selectedBy(sample.expectedGroups)]
  return {
    sampleId: sample.sampleId,
    selectedGroups,
    selectedRules: selected.size,
    filteredRules: extensionRules.length - selected.size,
    missed: [...expected].filter((ruleId) => !selected.has(ruleId)),
    extra: [...selected].filter((ruleId) => !expected.has(ruleId)),
  }
}
