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
        'R01 Order complete. Applies to: the order. The order must name a customer and a delivery window and must have at least one cargo item and at least one leg.',
      ],
    })
    expect(pack.clauses.get('R40')?.paragraphs.at(-1)).toBe(
      'Schedule G. Destination import requirements: R40 is extended: release also requires R41.',
    )
  })

  it('keeps the policy text in its sections, as written', () => {
    const { policy } = loadRulePack(materials, new Set(['R29']))
    expect(policy.title).toBe('Shipment Release Policy')
    expect(policy.preamble[0]).toMatch(/^\| Document No\. \|/)
    expect(policy.sections.map((section) => section.heading).slice(0, 5)).toEqual([
      '1. Purpose',
      '2. Scope',
      '3. Definitions and conventions',
      '4. Roles and responsibilities',
      'Part A. Order and cargo basics',
    ])
    expect(policy.sections.find((section) => section.heading.startsWith('G.NZ'))?.level).toBe(3)
    expect(policy.sections.at(-1)?.heading).toBe('Revision history')
  })

  it('refuses to start when a code evaluator is not registered', () => {
    expect(() => loadRulePack(materials, new Set())).toThrow(RulePackError)
  })
})
