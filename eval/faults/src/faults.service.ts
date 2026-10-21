import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FaultResult, FaultScenario } from './fault.types.js'
import { repositoryRoot } from './faults.fixture.js'
import { f03, f05, f06, f07, f08, f09, f10 } from './scenarios/coordinator.scenarios.js'
import { f01, restartLoop } from './scenarios/crash-recovery.scenarios.js'
import { f02, f04 } from './scenarios/duplicate-delivery.scenarios.js'
import { f11, f12, f13, f14, f15, f16, f17, f18 } from './scenarios/gate.scenarios.js'

export const faultScenarios: readonly FaultScenario[] = [
  f01,
  f02,
  f03,
  f04,
  f05,
  f06,
  f07,
  f08,
  f09,
  f10,
  restartLoop,
  f11,
  f12,
  f13,
  f14,
  f15,
  f16,
  f17,
  f18,
]

export type FaultRun = FaultScenario & FaultResult & { durationMs: number }

export const runFaults = async (ids: readonly string[] = []): Promise<FaultRun[]> => {
  const selected =
    ids.length > 0 ? faultScenarios.filter((scenario) => ids.includes(scenario.id)) : faultScenarios
  const runs: FaultRun[] = []
  for (const scenario of selected) {
    const started = Date.now()
    let result: FaultResult
    try {
      result = await scenario.run()
    } catch (error) {
      result = { passed: false, observations: [`FAILED: the scenario threw ${String(error)}`] }
    }
    runs.push({ ...scenario, ...result, durationMs: Date.now() - started })
  }
  return runs
}

export const renderReport = (runs: readonly FaultRun[], generatedAt: string): string => {
  const passed = runs.filter((run) => run.passed).length
  return [
    '# Fault report',
    '',
    `Generated ${generatedAt} by \`pnpm faults\`. ${passed} of ${runs.length} scenarios passed.`,
    '',
    '| Fault | Scenario | Expected | Result |',
    '|---|---|---|---|',
    ...runs.map(
      (run) =>
        `| ${run.id} | ${run.title} | ${run.expectation} | ${run.passed ? 'Pass' : '**Fail**'} |`,
    ),
    '',
    ...runs.flatMap((run) => [
      `## ${run.id} · ${run.title}`,
      '',
      `Expected: ${run.expectation}. ${run.passed ? 'Passed' : 'Failed'} in ${run.durationMs} ms.`,
      '',
      ...run.observations.map((line) => `- ${line}`),
      ...(run.notes ? ['', `Note: ${run.notes}.`] : []),
      '',
    ]),
  ].join('\n')
}

export const writeReport = (runs: readonly FaultRun[]): string => {
  const directory = join(repositoryRoot, 'var/reports')
  mkdirSync(directory, { recursive: true })
  const generatedAt = new Date().toISOString()
  const path = join(directory, 'faults.md')
  writeFileSync(path, renderReport(runs, generatedAt))
  writeFileSync(join(directory, 'faults.json'), JSON.stringify({ generatedAt, runs }, null, 2))
  return path
}
