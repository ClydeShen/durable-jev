import type { CaseView } from '@durable-jev/agent-core'
import type { HumanTask } from '@durable-jev/contracts'
import {
  applyRevision,
  type CaseEvent,
  type CaseFile,
  createLocalLogisticsAgents,
  dispatchCase,
  type LocalLogisticsAgents,
  orderStatusOf,
} from '@durable-jev/logistics'
import { ScriptedJudge } from '@durable-jev/model-providers'

interface StepResult {
  label: string
  kind: CaseEvent['kind']
  problems: string[]
}

export interface CaseReplay {
  caseId: string
  steps: StepResult[]
}

const replayStart = Date.parse('2026-10-30T08:00:00Z')

function keyOf(ruleId: string, scope: HumanTask['scope']): string {
  if (scope.kind === 'cargoItem') return `${ruleId}@${scope.cargoItemId}`
  if (scope.kind === 'leg') return `${ruleId}@${scope.legId}`
  return ruleId
}

function outcomeKey(outcome: CaseView['outcomes'][number]) {
  return keyOf(outcome.ruleId, outcome.scope)
}

function checkExpectation(view: CaseView, event: Extract<CaseEvent, { kind: 'expect' }>): string[] {
  const problems: string[] = []
  const status = orderStatusOf(view)
  if (event.orderStatus && status !== event.orderStatus) {
    problems.push(`order is ${status}, expected ${event.orderStatus}`)
  }
  const outcomes = new Map(view.outcomes.map((outcome) => [outcomeKey(outcome), outcome]))
  for (const [key, expected] of Object.entries(event.statuses)) {
    const actual = outcomes.get(key)?.status
    if (actual !== expected) problems.push(`${key} is ${actual ?? 'missing'}, expected ${expected}`)
  }
  if (event.openTasks) {
    const open = view.tasks
      .filter((task) => task.status === 'OPEN')
      .map((task) => keyOf(task.ruleId, task.scope))
    const [actual, expected] = [[...new Set(open)].sort(), [...event.openTasks].sort()]
    if (actual.join() !== expected.join())
      problems.push(`open tasks are [${actual}], expected [${expected}]`)
  }
  for (const [key, change] of Object.entries(event.invalidatedBy ?? {})) {
    const actual = outcomes.get(key)?.invalidatedBy
    if (actual !== change)
      problems.push(`${key} was invalidated by ${actual ?? 'nothing'}, expected ${change}`)
  }
  for (const ruleId of event.reused ?? []) {
    const notReused = view.outcomes.filter(
      (outcome) => outcome.ruleId === ruleId && !outcome.reused,
    )
    if (notReused.length > 0)
      problems.push(`${ruleId} was re-evaluated, expected its result to be reused`)
  }
  return problems
}

function taskFor(view: CaseView, key: string): HumanTask | undefined {
  const matching = view.tasks.filter((task) => keyOf(task.ruleId, task.scope) === key)
  return matching.find((task) => task.status === 'OPEN') ?? matching.at(-1)
}

class CaseReplayer {
  private clock = replayStart
  private shipment: CaseFile['shipment']
  private readonly agents: LocalLogisticsAgents

  constructor(
    private readonly caseFile: CaseFile,
    materialsDirectory: string,
  ) {
    this.shipment = caseFile.shipment
    this.agents = createLocalLogisticsAgents({
      materialsDirectory,
      judgeFor: () => new ScriptedJudge(caseFile.scriptedJudgements),
      now: () => new Date(this.clock).toISOString(),
    })
  }

  private get caseId() {
    return this.caseFile.shipment.caseId
  }

  private async view(): Promise<CaseView> {
    const { outcomes, tasks } = await this.agents.orchestrator.state(this.caseId)
    return { record: this.agents.coordination.runtime.view(this.caseId).record, outcomes, tasks }
  }

  async start() {
    await this.agents.orchestrator.submit(this.shipment)
  }

  async run(event: CaseEvent): Promise<string[]> {
    const { orchestrator, coordination } = this.agents
    switch (event.kind) {
      case 'expect':
        return checkExpectation(await this.view(), event)
      case 'act':
        return this.act(event)
      case 'revise':
        this.shipment = applyRevision(this.shipment, event.patch)
        await orchestrator.submit(this.shipment)
        return []
      case 'dispatch': {
        const now = () => new Date(this.clock).toISOString()
        const result = await dispatchCase(
          orchestrator,
          coordination.store,
          this.caseId,
          event.actor,
          now,
        )
        if (event.expectRefusal === result.ok) {
          return [
            result.ok
              ? 'dispatch succeeded, expected a refusal'
              : `dispatch refused: ${result.message}`,
          ]
        }
        return []
      }
      case 'advanceClock':
        this.clock += event.hours * 3_600_000
        await orchestrator.propagate(this.caseId)
        return []
    }
  }

  private async act(event: Extract<CaseEvent, { kind: 'act' }>): Promise<string[]> {
    const task = taskFor(await this.view(), event.task)
    if (!task) return [`no task ${event.task}`]
    const decision = await this.agents.orchestrator.decide(task.humanTaskId, {
      ...event.decision,
      actor: event.actor,
    })
    if (event.expectRefusal) {
      if (decision.ok) return [`${event.task} was accepted, expected ${event.expectRefusal}`]
      if (decision.reason !== event.expectRefusal) {
        return [
          `${event.task} was refused with ${decision.reason}, expected ${event.expectRefusal}`,
        ]
      }
      return []
    }
    return decision.ok ? [] : [`${event.task} was refused: ${decision.reason} ${decision.message}`]
  }
}

export async function replayCase(
  caseFile: CaseFile,
  materialsDirectory: string,
): Promise<CaseReplay> {
  const replayer = new CaseReplayer(caseFile, materialsDirectory)
  await replayer.start()
  const steps: StepResult[] = []
  for (const event of caseFile.events) {
    steps.push({ label: event.label, kind: event.kind, problems: await replayer.run(event) })
  }
  return { caseId: caseFile.shipment.caseId, steps }
}
