import { join } from 'node:path'
import type { CaseView } from '@durable-jev/agent-core'
import { canonicalJson, type HumanTask } from '@durable-jev/contracts'
import type { HumanAction } from '@durable-jev/human-tasks'
import { applyRevision } from '@durable-jev/logistics'
import { actor, caseFile, FaultLab } from './faults/lab.js'

export interface GateScenario {
  mutation: 'P2' | 'P3'
  variant: 'same-version' | 'new-version'
  activation: 'pinned' | 're-evaluate' | 'new-case' | 'unaffected'
  completed: boolean
}

const ruleOf = (mutation: GateScenario['mutation']) => (mutation === 'P2' ? 'R13' : 'R21')

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
  for (let step = 0; step < 3; step++) {
    const task = await lab.openTask(`${ruleId}@ITEM-1`)
    if (!task) break
    const wrongRole = await decide(lab, task, { type: 'approve', actor: actor('x', 'dispatcher') })
    const sameActor =
      task.requiredRole === 'qualityReviewer'
        ? await decide(lab, task, {
            type: 'approve',
            actor: actor('complianceReviewer', 'qualityReviewer'),
          })
        : undefined
    const missingReport =
      task.taskType === 'OPERATION' ? await decide(lab, task, actionFor(task)) : undefined
    const result =
      missingReport === 'ACCEPTED' ? missingReport : await decide(lab, task, actionFor(task, true))
    decisions.push({
      taskId: task.humanTaskId,
      role: task.requiredRole,
      wrongRole,
      sameActor,
      missingReport,
      result,
    })
    if (result !== 'ACCEPTED') break
  }
  return decisions
}

async function prepare(lab: FaultLab, scenario: GateScenario, ruleId: string) {
  const sample = caseFile(lab.caseId)
  const revision = sample.events.find((event) => event.kind === 'revise')
  const shipment =
    scenario.activation === 'unaffected' || !revision
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
  const ruleId = ruleOf(scenario.mutation)
  const mutationCase = scenario.mutation === 'P2' ? 'LOG-003' : 'LOG-008'
  const caseId = scenario.activation === 'unaffected' ? 'LOG-001' : mutationCase
  const selected = scenario.activation === 'pinned' ? baseline : candidate
  const initial = scenario.activation === 'new-case' ? candidate : baseline
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
      scenario.activation === 're-evaluate' && scenario.variant === 'new-version' && prior
        ? await decide(lab, prior, actionFor(prior))
        : undefined
    const decisions = await finishGate(lab, ruleId)
    const final = snapshot(await lab.view(), ruleId)
    const observation = { scenario, before, after, staleDecision, decisions, final, problems }
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
