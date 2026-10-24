import type { CheckStatus } from '@durable-jev/contracts'
import { describe, expect, it } from 'vitest'
import { evaluateRuleGraph, type LeafEvaluator } from './evaluate-rule-graph.js'
import type { CaseFacts } from './facts.js'
import type { RuleDefinition, RuleSet } from './rule-definition.js'
import { RuleIndex } from './rule-selection.js'
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
  rootScope: 'order',
  mixingMatrix: [
    { categories: ['general', 'general'], outcome: 'allowed' },
    { categories: ['general', 'coldChain'], outcome: 'allowed' },
    { categories: ['general', 'controlled'], outcome: 'allowed' },
    { categories: ['coldChain', 'coldChain'], outcome: 'allowed' },
    { categories: ['coldChain', 'controlled'], outcome: 'allowed' },
    { categories: ['controlled', 'controlled'], outcome: 'allowed' },
  ],
  selection: { classifierRuleId: 'R42', scope: 'cargoItem', dimension: 'commodityGroups' },
  rules: [classifier, permit, handover],
}

const classifiedAs =
  (status: CheckStatus, groups: string[]): LeafEvaluator =>
  () => ({ status, observedValue: groups })

function order(destinationCountry: string, customerId: string): CaseFacts {
  const orderFacts = { destinationCountry, customerId, handover: 'dock', documents: [] }
  const item = { description: 'Insulin pens' }
  return {
    entityVersions: {},
    root: { scope: { kind: 'order' }, facts: orderFacts },
    context: { order: orderFacts, cargoItems: [item], legs: [] },
    collections: {
      cargoItem: [
        { scope: { kind: 'cargoItem', cargoItemId: 'ITEM-1' }, facts: item, context: { item } },
      ],
    },
    selection: { destinations: [destinationCountry], customers: [customerId] },
  }
}

const evaluate = (facts: CaseFacts, judge: LeafEvaluator) =>
  evaluateRuleGraph(ruleSet, facts, {
    evaluators: new Map([['R42', judge]]),
    parameters: { commodityInclusionThreshold: 0.25 },
  })

describe('rule selection', () => {
  it('uses declared classifier scopes and dimensions, including unresolved collections', async () => {
    const classifyRule: RuleDefinition = {
      ...base,
      ruleId: 'CLASS-01',
      title: 'Classification',
      owner: 'record-review',
      scope: 'entry',
      dependsOn: [],
      evaluator: { kind: 'semantic', ref: 'CLASS-01' },
      invalidationTriggers: [],
      semantic: {
        promptVersion: '1',
        question: { kind: 'choice', text: 'Which band?', options: { high: 'High', low: 'Low' } },
        state: { note: 'entry.note' },
        passWhen: { selectChoicesAtLeast: 0.25 },
      },
    }
    const selectedRule: RuleDefinition = {
      ...handover,
      ruleId: 'POLICY-01',
      owner: 'record-review',
      scope: 'record',
      dependsOn: ['CLASS-01'],
      applicability: { riskBands: ['high'] },
      expression: { passWhen: 'record.amount = 100' },
      invalidationTriggers: [],
    }
    const rules: RuleSet = {
      rootScope: 'record',
      ruleSetVersion: 'classifier-contract',
      mixingMatrix: [],
      selection: { classifierRuleId: 'CLASS-01', scope: 'entry', dimension: 'riskBands' },
      rules: [classifyRule, selectedRule],
    }
    const entry = {
      scope: { kind: 'entry', entityId: 'ENTRY-1' },
      facts: { note: 'Review' },
      context: { entry: { note: 'Review' } },
    }
    const facts: CaseFacts = {
      entityVersions: {},
      root: { scope: { kind: 'record' }, facts: { amount: 100 } },
      context: { record: { amount: 100 } },
      collections: { entry: [entry] },
    }
    const environment = {
      parameters: {},
      evaluators: new Map<string, LeafEvaluator>([['CLASS-01', classifiedAs('PASS', ['high'])]]),
    }
    expect(validateRuleSet(rules, { policyParameters: new Set() }).valid).toBe(true)
    expect(
      (await evaluateRuleGraph(rules, facts, environment)).outcomeOf('POLICY-01')?.status,
    ).toBe('PASS')
    const unresolved = await evaluateRuleGraph(
      rules,
      { ...facts, collections: { entry: [] } },
      environment,
    )
    expect(unresolved.outcomeOf('POLICY-01')).toMatchObject({
      status: 'BLOCKED_DEPENDENCY',
      blockedBy: ['CLASS-01'],
    })
    await expect(
      evaluateRuleGraph(rules, { ...facts, collections: { entry: [entry, entry] } }, environment),
    ).rejects.toThrow('duplicate member scope')
    await expect(
      evaluateRuleGraph(
        rules,
        { ...facts, root: { scope: { kind: 'order' }, facts: {} } },
        environment,
      ),
    ).rejects.toThrow('expected root scope record')
  })

  it('indexes domain-supplied dimensions without interpreting their names', () => {
    const index = new RuleIndex([
      {
        ruleId: 'POLICY-1',
        applicability: { products: ['motor'], riskLevels: ['high', 'medium'] },
      },
      { ruleId: 'POLICY-2' },
    ])
    expect(index.decide('POLICY-1', { products: ['motor'], riskLevels: ['medium'] })).toBe(
      'selected',
    )
    expect(index.decide('POLICY-1', { products: ['motor'], riskLevels: ['low'] })).toBe('filtered')
    expect(index.decide('POLICY-1', { products: ['motor'], riskLevels: undefined })).toBe('pending')
    expect(index.decide('POLICY-1', { products: ['motor'], riskLevels: [] })).toBe('filtered')
    expect(index.decide('POLICY-2', {})).toBe('selected')
  })

  it('does not confuse dimension names with values containing separators', () => {
    const index = new RuleIndex([
      { ruleId: 'POLICY-1', applicability: { 'risk:level': ['high'], risk: ['level:low'] } },
    ])
    expect(index.decide('POLICY-1', { 'risk:level': ['low'], risk: ['level:high'] })).toBe(
      'filtered',
    )
  })

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
