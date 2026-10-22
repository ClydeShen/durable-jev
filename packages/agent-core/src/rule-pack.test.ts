import { describe, expect, it } from 'vitest'
import { loadRulePack, RulePackError } from './rule-pack.js'

const materials = new URL('../../../eval/materials/', import.meta.url).pathname

describe('loadRulePack', () => {
  it('loads the policy-v1 materials without validation issues', () => {
    const pack = loadRulePack(materials, new Set(['R29']))
    expect(pack.policyVersion).toBe('policy-v1')
    expect(pack.ruleSet.rules.map((rule) => rule.ruleId)).toContain('R40')
  })

  it('refuses to start when a code evaluator is not registered', () => {
    expect(() => loadRulePack(materials, new Set())).toThrow(RulePackError)
  })
})
