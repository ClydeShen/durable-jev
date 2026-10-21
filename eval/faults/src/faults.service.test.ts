import { describe, expect, it } from 'vitest'
import { renderReport, runFaults } from './faults.js'

describe('fault runner', () => {
  it('runs the in-process scenarios and reports each check', async () => {
    const runs = await runFaults(['F06', 'F07', 'F08'])
    expect(runs.map((run) => [run.id, run.passed])).toEqual([
      ['F06', true],
      ['F07', true],
      ['F08', true],
    ])
    const report = renderReport(runs, '2026-10-20T00:00:00.000Z')
    expect(report).toContain('3 of 3 scenarios passed')
    expect(report).toContain('| F08 | The same field result submitted twice |')
  })

  it('runs the gate scenarios F11 to F18 in process', async () => {
    const runs = await runFaults(['F11', 'F12', 'F13', 'F14', 'F15', 'F16', 'F17', 'F18'])
    expect(runs.filter((run) => !run.passed).map((run) => run.observations)).toEqual([])
  })
})
