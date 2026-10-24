import { join } from 'node:path'
import type { CaseView } from '@durable-jev/agent-core'
import { canonicalJson, type HumanTask } from '@durable-jev/contracts'
import type { HumanAction } from '@durable-jev/human-tasks'
import { applyRevision } from '@durable-jev/logistics'
import { actor, caseFile, FaultLab } from './faults/lab.js'
import { gateMutations } from './gate-change-packs.js'

type GateCase =
  | { kind: 'existing'; activation: 'pinned' | 're-evaluate'; completed: boolean }
  | { kind: 'new' | 'unaffected'; completed: false }

export type GateScenario = GateCase & {
  mutation: keyof typeof gateMutations
  variant: 'same-version' | 'new-version'
}

export const gateCases: readonly GateCase[] = [
  { kind: 'existing', activation: 'pinned', completed: false },
  { kind: 'existing', activation: 'pinned', completed: true },
  { kind: 'existing', activation: 're-evaluate', completed: false },
  { kind: 'existing', activation: 're-evaluate', completed: true },
  { kind: 'new', completed: false },
  { kind: 'unaffected', completed: false },
]

/** Preserve the archived report format while keeping case type and policy activation distinct. */
export function scenarioEvidence(scenario: GateScenario) {
  let activation: 'pinned' | 're-evaluate' | 'new-case' | 'unaffected'
  if (scenario.kind === 'existing') activation = scenario.activation
  else activation = scenario.kind === 'new' ? 'new-case' : 'unaffected'
  return {
    mutation: scenario.mutation,
    variant: scenario.variant,
    activation,
    completed: scenario.completed,
  }
}

interface GateAttempt {
  sameActor?: string
  missingReport?: string
  result: string
}

function snapshot(view: CaseView, ruleId: string) {
  return {
    outcomes: view.outcomes.filter((outcome) => outcome.ruleId === ruleId),
    tasks: view.tasks.filter((task) => task.ruleId === ruleId),
  }
}

function actionFor(task: HumanTask, withReport = false): HumanAction {
  if (task.taskType === 'APPROVAL') {
    return { type: 'approve', actor: actor(task.requiredRole, task.requiredRole) }
  }
  return {
    type: 'complete',
    actor: actor('wen', 'warehouseOperator'),
    fields: {
      newPackagingId: 'PKG-P3',
      photoRef: 'PHOTO-P3',
      ...(withReport ? { inspectionReportRef: 'REPORT-P3' } : {}),
    },
    evidenceRefs: withReport ? ['PHOTO-P3', 'REPORT-P3'] : ['PHOTO-P3'],
  }
}

async function decide(lab: FaultLab, task: HumanTask, action: HumanAction) {
  const result = await lab.decide(task, action)
  return result.ok ? 'ACCEPTED' : result.reason
}

async function finishGate(lab: FaultLab, ruleId: string) {
  const decisions = []
  const maxGateActions = 3 // A loop guard for these one/two-step fixtures, not an engine limit.
  for (let step = 0; step < maxGateActions; step++) {
    const task = await lab.openTask(`${ruleId}@ITEM-1`)
    if (!task) break
    const wrongRole = await decide(lab, task, { type: 'approve', actor: actor('x', 'dispatcher') })
    const attempt =
      task.taskType === 'APPROVAL'
        ? await probeApproval(lab, task)
        : await probeOperation(lab, task)
    decisions.push({
      taskId: task.humanTaskId,
      role: task.requiredRole,
      wrongRole,
      ...attempt,
    })
    if (attempt.result !== 'ACCEPTED') break
  }
  return decisions
}

async function probeApproval(lab: FaultLab, task: HumanTask): Promise<GateAttempt> {
  const sameActor =
    task.requiredRole === 'qualityReviewer'
      ? await decide(lab, task, {
          type: 'approve',
          actor: actor('complianceReviewer', 'qualityReviewer'),
        })
      : undefined
  return { sameActor, result: await decide(lab, task, actionFor(task)) }
}

async function probeOperation(lab: FaultLab, task: HumanTask): Promise<GateAttempt> {
  const missingReport = await decide(lab, task, actionFor(task))
  // An accepted incomplete submission already completed the old task; do not submit twice.
  const result =
    missingReport === 'ACCEPTED' ? missingReport : await decide(lab, task, actionFor(task, true))
  return { missingReport, result }
}

async function prepare(lab: FaultLab, scenario: GateScenario, ruleId: string) {
  const sample = caseFile(lab.caseId)
  const revision = sample.events.find((event) => event.kind === 'revise')
  const shipment =
    scenario.kind === 'unaffected' || !revision
      ? sample.shipment
      : applyRevision(sample.shipment, revision.patch)
  await lab.submit(shipment)
  if (scenario.completed) {
    const task = await lab.openTask(`${ruleId}@ITEM-1`)
    if (!task || (await decide(lab, task, actionFor(task))) !== 'ACCEPTED')
      throw new Error('expected the original gate to accept its original action')
  }
  return snapshot(await lab.view(), ruleId)
}

/** File-backed gate migration characterization; not a process crash or full dispatch test. */
export async function observeGateChange(
  scenario: GateScenario,
  baseline: string,
  candidate: string,
  directory: string,
) {
  const { ruleId, caseId: mutationCase } = gateMutations[scenario.mutation]
  const caseId = scenario.kind === 'unaffected' ? 'LOG-001' : mutationCase
  const pinned = scenario.kind === 'existing' && scenario.activation === 'pinned'
  const selected = pinned ? baseline : candidate
  const initial = scenario.kind === 'new' ? candidate : baseline
  const open = (materialsDirectory: string) =>
    new FaultLab(caseId, { materialsDirectory, dataDirectory: join(directory, 'stores') })
  const original = open(initial)
  const before = await prepare(original, scenario, ruleId).finally(() => original.agents.close())
  const lab = open(selected)
  const problems: string[] = []
  try {
    const reopened = snapshot(await lab.view(), ruleId)
    if (canonicalJson(before) !== canonicalJson(reopened))
      problems.push('state changed across store reopen')
    await lab.agents.orchestrator.propagate(caseId)
    const after = snapshot(await lab.view(), ruleId)
    const prior = before.tasks.find((task) => task.status === 'OPEN')
    const staleDecision =
      scenario.kind === 'existing' &&
      scenario.activation === 're-evaluate' &&
      scenario.variant === 'new-version' &&
      prior
        ? await decide(lab, prior, actionFor(prior))
        : undefined
    const decisions = await finishGate(lab, ruleId)
    const final = snapshot(await lab.view(), ruleId)
    const observation = {
      scenario: scenarioEvidence(scenario),
      before,
      after,
      staleDecision,
      decisions,
      final,
      problems,
    }
    checkObservation(observation)
    return observation
  } finally {
    lab.agents.close()
  }
}

function checkObservation(observation: Awaited<ReturnType<typeof observeGateChange>>) {
  const { scenario, before, after, decisions, final, problems, staleDecision } = observation
  if (scenario.activation === 'pinned') {
    if (canonicalJson(before) !== canonicalJson(after))
      problems.push('unchanged policy altered the gate')
  }
  if (staleDecision && staleDecision !== 'NOT_OPEN')
    problems.push(`old task accepted: ${staleDecision}`)
  if (decisions.some((item) => item.result !== 'ACCEPTED' || item.wrongRole !== 'UNAUTHORIZED'))
    problems.push('gate completion or authorization control failed')
  if (decisions.some((item) => item.sameActor && item.sameActor !== 'SAME_ACTOR'))
    problems.push('distinct actor control failed')
  checkCandidate(observation)
  const expected = scenario.activation === 'unaffected' ? 'NOT_APPLICABLE' : 'PASS'
  if (
    !final.outcomes.every((outcome) => outcome.status === expected) ||
    final.outcomes.length === 0
  )
    problems.push(`expected final gate ${expected}`)
}

function checkCandidate({
  scenario,
  before,
  after,
  decisions,
  problems,
}: Awaited<ReturnType<typeof observeGateChange>>) {
  if (
    scenario.activation === 'unaffected' &&
    before.tasks.length + after.tasks.length + decisions.length > 0
  )
    problems.push('unaffected cargo acquired human work')
  const enforced =
    scenario.activation === 'new-case' ||
    (scenario.activation === 're-evaluate' && scenario.variant === 'new-version')
  if (enforced && scenario.mutation === 'P2' && decisions.length !== 2)
    problems.push('new approval chain did not require both signatures')
  if (enforced && scenario.mutation === 'P3' && decisions[0]?.missingReport !== 'MISSING_EVIDENCE')
    problems.push('new operation accepted missing inspection report')
}
