import { describe, expect, it } from 'vitest'
import { parseProofOutput } from './proof-output.helpers.js'

describe('proof output', () => {
  it('reads replay output with stages', () => {
    const output = parseProofOutput(
      [
        'Semantic judge: scripted answers',
        '',
        'PASS  LOG-001  General cargo  (draft)',
        '      ok  1. submit',
        '      ok  2. dispatch',
        'FAIL  LOG-002  Cold chain  (draft)',
        '      XX  1. submit',
        '           R18 expected PASS',
        '',
        '1/2 cases passed',
      ].join('\n'),
    )
    expect(output.summary).toBe('1/2 cases passed')
    expect(output.items.map((item) => [item.status, item.id])).toEqual([
      ['PASS', 'LOG-001'],
      ['FAIL', 'LOG-002'],
    ])
    expect(output.items[1]?.details).toEqual(['XX  1. submit', 'R18 expected PASS'])
  })

  it('reads fault output and ignores the report line', () => {
    const output = parseProofOutput(
      'PASS  F01  Kill inside a tool call\n        resumed once\n\n19/19 fault scenarios passed\nReport: var/reports/faults.md\n',
    )
    expect(output.items).toHaveLength(1)
    expect(output.items[0]?.details).toEqual(['resumed once'])
    expect(output.summary).toBe('19/19 fault scenarios passed')
  })
})
