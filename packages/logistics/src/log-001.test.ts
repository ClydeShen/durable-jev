import { loadRulePack, semanticEvaluator } from '@durable-jev/agent-core'
import { ScriptedJudge } from '@durable-jev/model-providers'
import { evaluateRuleGraph, type LeafEvaluator } from '@durable-jev/rule-engine'
import { describe, expect, it } from 'vitest'
import { buildCaseFacts } from './case-facts.js'
import { loadCaseFile } from './case-file.js'
import { loadReferenceData } from './reference-data.js'

const materials = new URL('../../../eval/materials/', import.meta.url).pathname

describe('LOG-001 materials', () => {
  it('pass every applicable rule and wait only for the warehouse to load', async () => {
    const pack = loadRulePack(materials, new Set(['R29']))
    const caseFile = loadCaseFile(`${materials}cases/LOG-001.json`)
    const facts = buildCaseFacts(caseFile.shipment, loadReferenceData(`${materials}mock-data`))
    const semantic = semanticEvaluator(new ScriptedJudge(caseFile.scriptedJudgements))
    const stub =
      (status: 'PASS' | 'WAITING_HUMAN'): LeafEvaluator =>
      () => ({ status })
    const evaluators = new Map(
      pack.ruleSet.rules.map((rule): [string, LeafEvaluator] => [
        rule.evaluator.ref,
        rule.evaluator.kind === 'semantic'
          ? semantic
          : stub(rule.ruleId === 'R39' ? 'WAITING_HUMAN' : 'PASS'),
      ]),
    )
    const graph = await evaluateRuleGraph(pack.ruleSet, facts, {
      evaluators,
      parameters: pack.parameters,
    })
    const notPassed = graph.outcomes
      .filter((outcome) => outcome.status !== 'PASS')
      .map((outcome) => `${outcome.ruleId}:${outcome.status}`)
    expect(notPassed.sort()).toEqual(['R39:WAITING_HUMAN', 'R40:WAITING_HUMAN'])
    expect(graph.outcomeOf('R40')?.blockedBy).toEqual(['R39'])
  })
})
