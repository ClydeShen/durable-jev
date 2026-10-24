import { describe, expect, it } from 'vitest'
import { gateCases, scenarioEvidence } from './gate-change.js'
import { gateMutations } from './gate-change-packs.js'

describe('gate experiment definition', () => {
  it('keeps the six archived cases in order for every mutation and version variant', () => {
    const cases = [
      { activation: 'pinned', completed: false },
      { activation: 'pinned', completed: true },
      { activation: 're-evaluate', completed: false },
      { activation: 're-evaluate', completed: true },
      { activation: 'new-case', completed: false },
      { activation: 'unaffected', completed: false },
    ]
    for (const mutation of ['P2', 'P3'] as const) {
      for (const variant of ['same-version', 'new-version'] as const) {
        expect(
          gateCases.map((testCase) => scenarioEvidence({ mutation, variant, ...testCase })),
        ).toEqual(cases.map((testCase) => ({ mutation, variant, ...testCase })))
      }
    }
  })

  it('keeps each mutation paired with its original rule, case and policy heading', () => {
    expect(Object.keys(gateMutations)).toEqual(['P2', 'P3'])
    expect(gateMutations.P2).toMatchObject({ ruleId: 'R13', caseId: 'LOG-003' })
    expect(gateMutations.P3).toMatchObject({ ruleId: 'R21', caseId: 'LOG-008' })
    for (const definition of Object.values(gateMutations)) {
      expect(definition.policyText.startsWith(`**${definition.ruleId} `)).toBe(true)
    }
  })
})
