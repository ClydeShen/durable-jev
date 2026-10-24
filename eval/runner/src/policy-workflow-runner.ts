import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalJson } from '@durable-jev/contracts'
import { packHashes, writeEvidence } from './policy-evidence.js'
import type { PolicyWorkflow, WorkflowScenario, WorkflowState } from './policy-workflow.js'

interface WorkflowResult {
  before: WorkflowState
  after: WorkflowState
  finish: Awaited<ReturnType<PolicyWorkflow['finish']>>
}

function runChild(directory: string, phase: string, expectedCode: number): number {
  const started = performance.now()
  const child = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./policy-workflow-child.js', import.meta.url)), phase, directory],
    { encoding: 'utf8', timeout: 30_000 },
  )
  writeFileSync(join(directory, `${phase}.log`), `${child.stdout ?? ''}${child.stderr ?? ''}`)
  if (child.error || child.status !== expectedCode) {
    throw new Error(`workflow ${phase} exited ${child.status}: ${child.error ?? child.stderr}`)
  }
  return performance.now() - started
}

function readResult(directory: string): WorkflowResult {
  return JSON.parse(readFileSync(join(directory, 'result.json'), 'utf8'))
}

function observations(result: WorkflowResult) {
  const rule = result.after.outcomes.find((outcome) => outcome.key === 'R35@order')
  if (!rule) throw new Error('workflow result has no R35 outcome')
  return {
    r35: rule.status,
    openApprovals: result.after.tasks.filter(
      (task) => task.rule === 'R35' && task.status === 'OPEN',
    ).length,
    priorTaskDecision: result.finish.priorTaskDecision,
    additionalApprovals: result.finish.additionalApprovals,
    dispatched: result.finish.dispatch.ok,
  }
}

function completionProblems(result: WorkflowResult): string[] {
  const { finish } = result
  return [
    ...(!finish.dispatch.ok || !finish.completedAt ? ['order did not dispatch'] : []),
    ...(finish.retry.ok || finish.retry.reason !== 'ALREADY_DISPATCHED'
      ? ['repeat dispatch was not refused']
      : []),
    ...(finish.dispatchEvents !== 1 ? ['dispatch event count is not one'] : []),
    ...(finish.reservations !== 1 ? ['reservation count is not one'] : []),
    ...(finish.ready.outcomes.find((outcome) => outcome.key === 'R40@order')?.status !== 'PASS'
      ? ['release gate did not pass']
      : []),
    ...(finish.ready.tasks.some((task) => task.status === 'OPEN')
      ? ['open task remains at release']
      : []),
  ]
}

function runScenario(directory: string, scenario: WorkflowScenario) {
  const hashes = {
    baseline: packHashes(scenario.baseline),
    candidate: packHashes(scenario.candidate),
  }
  const results: {
    phase: string
    result: WorkflowResult
    problems: string[]
    executionMs: number
    resumeMs?: number
  }[] = []
  for (const phase of ['control', 'before-transition', 'after-transition']) {
    const data = join(directory, phase)
    mkdirSync(data, { recursive: true })
    writeEvidence(join(data, 'plan.json'), { scenario, hashes })
    const executionMs = runChild(data, phase, phase === 'control' ? 0 : 137)
    const resumeMs = phase === 'control' ? undefined : runChild(data, 'resume', 0)
    const result = readResult(data)
    const problems = completionProblems(result)
    if (phase === 'after-transition') {
      const interrupted: unknown = JSON.parse(readFileSync(join(data, 'interrupted.json'), 'utf8'))
      if (canonicalJson(interrupted) !== canonicalJson(result.after)) {
        problems.push('resumed transition changed the committed state')
      }
    }
    const control = results[0]?.result
    if (control && canonicalJson(control) !== canonicalJson(result)) {
      problems.push('resumed workflow differs from uninterrupted control')
    }
    results.push({ phase, result, problems, executionMs, resumeMs })
  }
  const control = results[0]
  if (!control) throw new Error('missing uninterrupted workflow control')
  return {
    scenario,
    observations: observations(control.result),
    recovery: results.map(({ phase, problems, executionMs, resumeMs }) => ({
      phase,
      problems,
      executionMs,
      resumeMs,
    })),
  }
}

/** Full-flow continuity evidence; policy expectations remain draft, not blind acceptance. */
export function observePolicyWorkflow(directory: string, baseline: string, candidate: string) {
  const runs = []
  for (const activation of ['pinned', 're-evaluate'] as const) {
    for (const extraCostCents of [60_000, 80_000]) {
      for (const approved of [false, true]) {
        const name = `${activation}-${extraCostCents}-${approved ? 'approved' : 'pending'}`
        runs.push(
          runScenario(join(directory, name), {
            baseline,
            candidate,
            activation,
            extraCostCents,
            approved,
          }),
        )
      }
    }
  }
  return runs
}
