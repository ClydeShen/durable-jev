import type { CheckStatus } from '@durable-jev/contracts'
import { describe, expect, it } from 'vitest'
import { evaluateRuleGraph, type LeafEvaluator } from './evaluate-rule-graph.js'
import type { CaseFacts } from './facts.js'
import type { RuleDefinition, RuleSet } from './rule-definition.js'
import { validateRuleSet } from './validate-rule-set.js'

const base: Pick<
  RuleDefinition,
  'version' | 'unknownPolicy' | 'inputPaths' | 'parameters' | 'invalidationTriggers'
> = {
  version: '1',
  unknownPolicy: 'block',
  inputPaths: [],
  parameters: [],
  invalidationTriggers: ['cargo'],
}

const classifier: RuleDefinition = {
  ...base,
  ruleId: 'R42',
  title: 'Commodity group',
  owner: 'destination-compliance',
  scope: 'cargoItem',
  dependsOn: [],
  evaluator: { kind: 'semantic', ref: 'R42' },
  parameters: ['commodityInclusionThreshold'],
  semantic: {
    promptVersion: 'v1',
    question: {
      kind: 'choice',
      text: 'Which commodity group?',
      options: { pharmaceutical: 'Medicines', chemical: 'Chemicals', general: 'Other' },
    },
    state: { description: 'item.description' },
    passWhen: { selectChoicesAtLeast: 'commodityInclusionThreshold' },
  },
}

const permit: RuleDefinition = {
  ...base,
  ruleId: 'DEST-NZ-PHARMA-1',
  title: 'NZ import permit',
  owner: 'destination-compliance',
  scope: 'order',
  applicability: { destinations: ['NZ'], commodityGroups: ['pharmaceutical'] },
  dependsOn: ['R42'],
  evaluator: { kind: 'expression', ref: 'DEST-NZ-PHARMA-1' },
  expression: { passWhen: 'list contains(order.documents.kind, "importPermit")' },
}

const handover: RuleDefinition = {
  ...base,
  ruleId: 'CUST-ACME-1',
  title: 'Acme handover',
  owner: 'commercial-control',
  scope: 'order',
  applicability: { customers: ['CUS-ACME'] },
  dependsOn: [],
  evaluator: { kind: 'expression', ref: 'CUST-ACME-1' },
  expression: { passWhen: 'order.handover = "dock"' },
}

const ruleSet: RuleSet = {
  ruleSetVersion: 'test',
  mixingMatrix: [
    { categories: ['general', 'general'], outcome: 'allowed' },
    { categories: ['general', 'coldChain'], outcome: 'allowed' },
    { categories: ['general', 'controlled'], outcome: 'allowed' },
    { categories: ['coldChain', 'coldChain'], outcome: 'allowed' },
    { categories: ['coldChain', 'controlled'], outcome: 'allowed' },
    { categories: ['controlled', 'controlled'], outcome: 'allowed' },
  ],
  selection: { classifierRuleId: 'R42' },
  rules: [classifier, permit, handover],
}

const classifiedAs =
  (status: CheckStatus, groups: string[]): LeafEvaluator =>
  () => ({ status, observedValue: groups })

function order(destinationCountry: string, customerId: string): CaseFacts {
  return {
    entityVersions: {},
    order: { destinationCountry, customerId, handover: 'dock', documents: [] },
    cargoItems: [{ cargoItemId: 'ITEM-1', facts: { description: 'Insulin pens' } }],
    legs: [],
  }
}

const evaluate = (facts: CaseFacts, judge: LeafEvaluator) =>
  evaluateRuleGraph(ruleSet, facts, {
    evaluators: new Map([['R42', judge]]),
    parameters: { commodityInclusionThreshold: 0.25 },
  })

describe('rule selection', () => {
  it('uses a rule set that passes validation', () => {
    const validation = validateRuleSet(ruleSet, {
      policyParameters: new Set(['commodityInclusionThreshold']),
    })
    expect(validation.issues).toEqual([])
  })

  it('evaluates the extension rules whose destination, group and customer match', async () => {
    const graph = await evaluate(order('NZ', 'CUS-ACME'), classifiedAs('PASS', ['pharmaceutical']))
    expect(graph.outcomeOf('DEST-NZ-PHARMA-1')).toMatchObject({ status: 'FAIL' })
    expect(graph.outcomeOf('CUST-ACME-1')).toMatchObject({ status: 'PASS' })
  })

  it('filters the others out without evaluating them', async () => {
    const graph = await evaluate(order('AU', 'CUS-MEDI'), classifiedAs('PASS', ['pharmaceutical']))
    expect(graph.outcomeOf('DEST-NZ-PHARMA-1')).toMatchObject({
      status: 'NOT_APPLICABLE',
      filtered: true,
    })
    expect(graph.outcomeOf('CUST-ACME-1')).toMatchObject({
      status: 'NOT_APPLICABLE',
      filtered: true,
    })
  })

  it('waits for the classifier before selecting by commodity group', async () => {
    const graph = await evaluate(order('NZ', 'CUS-ACME'), classifiedAs('UNKNOWN', []))
    expect(graph.outcomeOf('DEST-NZ-PHARMA-1')).toMatchObject({
      status: 'BLOCKED_DEPENDENCY',
      blockedBy: ['R42'],
    })
    expect(graph.outcomeOf('CUST-ACME-1')?.status).toBe('PASS')
  })

  it('rejects selection by commodity group without depending on the classifier', () => {
    const detached = { ...permit, dependsOn: [] }
    const validation = validateRuleSet(
      { ...ruleSet, rules: [classifier, detached, handover] },
      { policyParameters: new Set(['commodityInclusionThreshold']) },
    )
    expect(validation.issues.map((issue) => issue.code)).toEqual(['SELECTION'])
  })
})
