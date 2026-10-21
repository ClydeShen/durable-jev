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

  it('defines every policy rule R01 to R40', () => {
    const ruleIds = new Set(
      (loadRuleSetFile().rules as { ruleId: string }[]).map((rule) => rule.ruleId),
    )
    const policyRuleIds = Array.from(
      { length: 40 },
      (_, index) => `R${String(index + 1).padStart(2, '0')}`,
    )
    expect(policyRuleIds.filter((ruleId) => !ruleIds.has(ruleId))).toEqual([])
  })
})
