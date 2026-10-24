import { describe, expect, it } from 'vitest'
import { evaluateMixing } from './mixing.js'
import type { MixingRule } from './rule-definition.js'

const matrix: MixingRule[] = [
  { categories: ['general', 'coldChain'], outcome: 'allowed' },
  { categories: ['general', 'controlled'], outcome: 'forbidden' },
  {
    categories: ['coldChain', 'controlled'],
    outcome: 'requiresQualification',
    qualification: 'CTRL-COLD',
  },
]

describe('evaluateMixing', () => {
  it('keeps domain category names distinct when they contain separators', () => {
    const table: MixingRule[] = [
      { categories: ['a+b', 'c'], outcome: 'allowed' },
      { categories: ['a', 'b+c'], outcome: 'forbidden' },
    ]
    expect(evaluateMixing(table, ['a+b', 'c'], []).status).toBe('PASS')
    expect(evaluateMixing(table, ['a', 'b+c'], []).status).toBe('FAIL')
  })

  it('allows permitted mixes', () => {
    expect(evaluateMixing(matrix, ['general', 'coldChain', 'general'], [])).toEqual({
      status: 'PASS',
      observedValue: [],
    })
  })

  it('names forbidden mixes and missing qualifications', () => {
    expect(evaluateMixing(matrix, ['controlled', 'general'], ['CTRL-COLD']).observedValue).toEqual([
      'controlled+general forbidden',
    ])
    expect(evaluateMixing(matrix, ['controlled', 'coldChain'], [])).toEqual({
      status: 'FAIL',
      observedValue: ['coldChain+controlled needs CTRL-COLD'],
    })
    expect(evaluateMixing(matrix, ['controlled', 'coldChain'], ['CTRL-COLD']).status).toBe('PASS')
  })

  it('is unknown without the categories', () => {
    expect(evaluateMixing(matrix, null, []).status).toBe('UNKNOWN')
  })
})
