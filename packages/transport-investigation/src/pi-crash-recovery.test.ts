import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase, readUnpublishedOutboxEvents } from '@durable-jev/store'
import { afterEach, describe, expect, it } from 'vitest'

const script = new URL('./pi-investigation-process.fixture.ts', import.meta.url).pathname
const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function workDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'pi-investigation-'))
  directories.push(directory)
  return directory
}

function runProcess(directory: string, phase: 'start' | 'resume', crashAt?: string) {
  const result = spawnSync('pnpm', ['exec', 'tsx', script, directory, phase], {
    encoding: 'utf8',
    env: { ...process.env, CRASH_AT: crashAt ?? '' },
  })
  const lastLine = result.stdout.trim().split('\n').at(-1) ?? ''
  return {
    exitCode: result.status,
    report: result.status === 0 ? JSON.parse(lastLine) : undefined,
    stderr: result.stderr,
  }
}

const executions = (directory: string) =>
  readFileSync(join(directory, 'executions.log'), 'utf8').trim().split('\n')
const count = (names: string[], name: string) => names.filter((entry) => entry === name).length

describe('investigation on Pi Durable across a process kill', () => {
  it('resumes the same investigation and does not re-read finished tools', () => {
    const directory = workDirectory()
    expect(runProcess(directory, 'start', 'check_candidate:2').exitCode).toBe(137)
    const beforeRestart = executions(directory)

    const resumed = runProcess(directory, 'resume')
    expect(resumed.exitCode, resumed.stderr).toBe(0)
    expect(resumed.report.outcome).toMatchObject({
      status: 'completed',
      result: { outcome: 'REPLACEMENT', carrierId: 'CAR-GLACIER' },
    })
    expect(resumed.report.events[0]).toMatchObject({ type: 'run.resumed', restart: 1 })

    const all = executions(directory)
    // The listing finished before the kill: Pi reads its result back instead of running it.
    expect(count(beforeRestart, 'list_candidate_carriers')).toBe(1)
    expect(count(all, 'list_candidate_carriers')).toBe(1)
    expect(count(all, 'submit_investigation_result')).toBe(1)
  }, 60_000)

  it('hands a crash-looping investigation to the planner after two restarts', () => {
    const directory = workDirectory()
    expect(runProcess(directory, 'start', 'check_candidate:1').exitCode).toBe(137)
    expect(runProcess(directory, 'resume', 'check_candidate:1').exitCode).toBe(137)
    expect(runProcess(directory, 'resume', 'check_candidate:1').exitCode).toBe(137)

    const third = runProcess(directory, 'resume', 'check_candidate:1')
    expect(third.exitCode, third.stderr).toBe(0)
    expect(third.report.outcome).toMatchObject({ status: 'escalated', reason: 'restarts' })
  }, 60_000)

  it('resumes in a new trace that links back to the attempt that was killed', () => {
    const directory = workDirectory()
    expect(runProcess(directory, 'start', 'check_candidate:2').exitCode).toBe(137)
    expect(runProcess(directory, 'resume').exitCode).toBe(0)

    const recorded = readUnpublishedOutboxEvents(
      openDatabase(join(directory, 'runs.sqlite')),
      10_000,
    ).map(
      (row) =>
        row.payload as {
          kind: string
          eventName: string
          traceId?: string
          spanId?: string
          attempt?: number
          correlationId: string
          links?: { traceId: string; spanId: string; relation: string }[]
        },
    )
    const started = recorded.find((event) => event.eventName === 'run.started')
    const resumedSpan = recorded.find(
      (event) => event.kind === 'span' && event.eventName === 'agent.run.resumed',
    )
    expect(recorded.map((event) => event.eventName)).toEqual(
      expect.arrayContaining(['run.started', 'run.interrupted', 'run.resumed']),
    )
    // The killed attempt never finished its span; its start event is what the link points at.
    expect(recorded.some((event) => event.kind === 'span' && event.eventName === 'agent.run')).toBe(
      false,
    )
    expect(resumedSpan?.traceId).not.toBe(started?.traceId)
    expect(resumedSpan?.links).toEqual([
      { traceId: started?.traceId, spanId: started?.spanId, relation: 'resumes' },
    ])
    expect(new Set(recorded.map((event) => event.correlationId)).size).toBe(1)
  }, 60_000)
})
