import { validateRuleSet } from '@durable-jev/rule-engine'
import { describe, expect, it } from 'vitest'
import { loadPolicyParameters, loadRuleSetFile } from './materials.js'

describe('eval materials', () => {
  it('rules.json passes configuration validation against policy-v1', () => {
    const ruleSet = loadRuleSetFile()
    const parameters = loadPolicyParameters()
    const validation = validateRuleSet(ruleSet.rules, parameters)

    expect(validation.valid ? [] : validation.issues).toEqual([])
    expect(ruleSet.policyVersion).toBe(parameters.policyVersion)
  })

  it('evaluates R40 last', () => {
    const validation = validateRuleSet(loadRuleSetFile().rules, loadPolicyParameters())
    expect(validation.valid && validation.evaluationOrder.at(-1)).toBe('R40')
  })
})
