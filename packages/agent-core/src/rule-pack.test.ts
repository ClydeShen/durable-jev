import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadRulePack, RulePackError } from './rule-pack.js'

const materials = fileURLToPath(new URL('../../../eval/materials/', import.meta.url))

describe('loadRulePack', () => {
  it('loads the policy-v1 materials without validation issues', () => {
    const pack = loadRulePack(materials, new Set(['R29']))
    expect(pack.policyVersion).toBe('policy-v1')
    expect(pack.ruleSet.rules.map((rule) => rule.ruleId)).toContain('R40')
  })

  it('finds the policy clause of every rule, with later amendments', () => {
    const pack = loadRulePack(materials, new Set(['R29']))
    const missing = pack.ruleSet.rules.filter((rule) => !pack.clauses.has(rule.ruleId))
    expect(missing.map((rule) => rule.ruleId)).toEqual([])
    expect(pack.clauses.get('R01')).toEqual({
      section: 'Part A. Order and cargo basics',
      paragraphs: [
        'R01 Order complete. (order) The order names a customer and a delivery window, and has at least one cargo item and at least one leg.',
      ],
    })
    expect(pack.clauses.get('R40')?.paragraphs.at(-1)).toBe(
      'Appendix G. Destination import requirements: R40 additionally requires R41.',
    )
  })

  it('refuses to start when a code evaluator is not registered', () => {
    expect(() => loadRulePack(materials, new Set())).toThrow(RulePackError)
  })
})
