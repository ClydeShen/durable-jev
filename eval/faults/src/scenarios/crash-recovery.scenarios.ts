import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type FaultScenario, Observations } from '../fault.js'
import { runScript } from '../fixtures.js'

const investigationProcess =
  'packages/transport-investigation/src/pi-investigation-process.fixture.ts'

const executed = (directory: string) =>
  readFileSync(join(directory, 'executions.log'), 'utf8').trim().split('\n')
const count = (names: string[], name: string) => names.filter((entry) => entry === name).length

export const f01: FaultScenario = {
  id: 'F01',
  title: 'Process killed after a read-only tool finished',
  expectation: 'The same task resumes and no finished result is lost',
  async run() {
    const seen = new Observations()
    const directory = mkdtempSync(join(tmpdir(), 'fault-f01-'))
    try {
      const crashed = runScript(investigationProcess, [directory, 'start'], {
        CRASH_AT: 'check_candidate:2',
      })
      seen.check(
        crashed.exitCode === 137,
        'the investigation process was killed inside its 2nd candidate check',
      )
      const resumed = runScript(investigationProcess, [directory, 'resume'])
      const report =
        resumed.exitCode === 0 ? JSON.parse(resumed.stdout.trim().split('\n').at(-1) ?? '{}') : {}
      seen.check(
        report.outcome?.status === 'completed',
        'a new process resumed the same run to completion',
      )
      seen.check(
        report.outcome?.result?.carrierId === 'CAR-GLACIER',
        'it reached the same proposal (CAR-GLACIER)',
      )
      const names = executed(directory)
      seen.check(
        count(names, 'list_candidate_carriers') === 1,
        'the finished carrier listing was read back, not run again',
      )
      seen.check(count(names, 'submit_investigation_result') === 1, 'the result was submitted once')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
    return seen.result()
  },
}

export const restartLoop: FaultScenario = {
  id: 'F10b',
  title: 'Investigation process crashes on every attempt',
  expectation: 'After the restart limit the run stops and goes to a person',
  async run() {
    const seen = new Observations()
    const directory = mkdtempSync(join(tmpdir(), 'fault-f10b-'))
    try {
      const crash = { CRASH_AT: 'check_candidate:1' }
      const exits = [
        runScript(investigationProcess, [directory, 'start'], crash).exitCode,
        runScript(investigationProcess, [directory, 'resume'], crash).exitCode,
        runScript(investigationProcess, [directory, 'resume'], crash).exitCode,
      ]
      seen.check(
        exits.every((code) => code === 137),
        'three attempts were killed',
      )
      const last = runScript(investigationProcess, [directory, 'resume'], crash)
      const report =
        last.exitCode === 0 ? JSON.parse(last.stdout.trim().split('\n').at(-1) ?? '{}') : {}
      seen.check(
        report.outcome?.status === 'escalated' && report.outcome?.reason === 'restarts',
        'the third restart was refused: escalated with reason "restarts"',
      )
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
    return seen.result()
  },
}
