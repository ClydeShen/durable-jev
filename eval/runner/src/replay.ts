import type { CaseView } from '@durable-jev/agent-core'
import type { HumanTask } from '@durable-jev/contracts'
import {
  applyRevision,
  type CaseEvent,
  type CaseFile,
  caseEventKey,
  createLocalLogisticsAgents,
  dispatchCase,
  type LocalLogisticsAgents,
  orderStatusOf,
  RerouteDesk,
  rerouterModel,
} from '@durable-jev/logistics'
import { ScriptedJudge, type SemanticJudge } from '@durable-jev/model-providers'

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

type Expectation = Extract<CaseEvent, { kind: 'expect' }>
type OutcomesByKey = ReadonlyMap<string, CaseView['outcomes'][number]>

function orderStatusProblems(view: CaseView, event: Expectation): string[] {
  const status = orderStatusOf(view)
  return event.orderStatus && status !== event.orderStatus
    ? [`order is ${status}, expected ${event.orderStatus}`]
    : []
}

function statusProblems(outcomes: OutcomesByKey, event: Expectation): string[] {
  return Object.entries(event.statuses).flatMap(([key, expected]) => {
    const actual = outcomes.get(key)?.status
    return actual === expected ? [] : [`${key} is ${actual ?? 'missing'}, expected ${expected}`]
  })
}

function openTaskProblems(view: CaseView, event: Expectation): string[] {
  if (!event.openTasks) return []
  const open = view.tasks
    .filter((task) => task.status === 'OPEN')
    .map((task) => caseEventKey(task.ruleId, task.scope))
  const [actual, expected] = [[...new Set(open)].sort(), [...event.openTasks].sort()]
  return actual.join() === expected.join()
    ? []
    : [`open tasks are [${actual}], expected [${expected}]`]
}

function invalidationProblems(outcomes: OutcomesByKey, event: Expectation): string[] {
  return Object.entries(event.invalidatedBy ?? {}).flatMap(([key, change]) => {
    const actual = outcomes.get(key)?.invalidatedBy
    return actual === change
      ? []
      : [`${key} was invalidated by ${actual ?? 'nothing'}, expected ${change}`]
  })
}

function reuseProblems(view: CaseView, event: Expectation): string[] {
  return (event.reused ?? []).flatMap((ruleId) =>
    view.outcomes.some((outcome) => outcome.ruleId === ruleId && !outcome.reused)
      ? [`${ruleId} was re-evaluated, expected its result to be reused`]
      : [],
  )
}

function checkExpectation(view: CaseView, event: Expectation): string[] {
  const outcomes = new Map(
    view.outcomes.map((outcome) => [caseEventKey(outcome.ruleId, outcome.scope), outcome]),
  )
  return [
    ...orderStatusProblems(view, event),
    ...statusProblems(outcomes, event),
    ...openTaskProblems(view, event),
    ...invalidationProblems(outcomes, event),
    ...reuseProblems(view, event),
  ]
}

function checkInvestigation(
  desk: RerouteDesk,
  caseId: string,
  expected: NonNullable<Expectation['investigation']>,
): string[] {
  const investigation = desk.ofCase(caseId).at(-1)
  if (!investigation) return ['no investigation']
  const actual = {
    status: investigation.status,
    offerId: investigation.proposal?.offerId,
    extraCostCents: investigation.proposal?.extraCostCents,
  }
  return Object.entries(expected).flatMap(([key, value]) =>
    actual[key as keyof typeof actual] === value
      ? []
      : [`investigation ${key} is ${actual[key as keyof typeof actual]}, expected ${value}`],
  )
}

function taskFor(view: CaseView, key: string): HumanTask | undefined {
  const matching = view.tasks.filter((task) => caseEventKey(task.ruleId, task.scope) === key)
  return matching.find((task) => task.status === 'OPEN') ?? matching.at(-1)
}

class CaseReplayer {
  private clock = replayStart
  private shipment: CaseFile['shipment']
  private readonly agents: LocalLogisticsAgents
  private desk?: RerouteDesk

  constructor(
    private readonly caseFile: CaseFile,
    materialsDirectory: string,
    liveJudge?: SemanticJudge,
  ) {
    this.shipment = caseFile.shipment
    this.agents = createLocalLogisticsAgents({
      materialsDirectory,
      judgeFor: () => liveJudge ?? new ScriptedJudge(caseFile.scriptedJudgements),
      now: () => new Date(this.clock).toISOString(),
    })
  }

  private get caseId() {
    return this.caseFile.shipment.caseId
  }

  private view(): Promise<CaseView> {
    return this.agents.view(this.caseId)
  }

  async start() {
    await this.agents.orchestrator.submit(this.shipment)
    this.desk = await RerouteDesk.open({
      ...this.agents.transport,
      cases: this.agents.transport.store,
      storage: 'memory',
      model: rerouterModel(),
      now: () => new Date(this.clock).toISOString(),
    })
  }

  async stop() {
    await this.desk?.close()
  }

  private get openDesk(): RerouteDesk {
    if (!this.desk) throw new Error('replay has not started')
    return this.desk
  }

  async run(event: CaseEvent): Promise<string[]> {
    const { orchestrator, coordination } = this.agents
    switch (event.kind) {
      case 'expect':
        return [
          ...checkExpectation(await this.view(), event),
          ...(event.investigation
            ? checkInvestigation(this.openDesk, this.caseId, event.investigation)
            : []),
        ]
      case 'act':
        return this.act(event)
      case 'revise':
        this.shipment = applyRevision(this.shipment, event.patch)
        await orchestrator.submit(this.shipment)
        return []
      case 'incident': {
        const investigation = await this.openDesk.report(this.caseId, event.incident)
        await this.openDesk.settled(investigation.investigationId)
        return []
      }
      case 'decideProposal':
        return this.decideProposal(event)
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

  private async decideProposal(
    event: Extract<CaseEvent, { kind: 'decideProposal' }>,
  ): Promise<string[]> {
    const investigation = this.openDesk.ofCase(this.caseId).at(-1)
    if (!investigation) return ['no investigation']
    const result = this.openDesk.decide(investigation.investigationId, {
      type: event.decision,
      actor: event.actor,
    })
    if (event.expectRefusal) {
      return !result.ok && result.reason === event.expectRefusal
        ? []
        : [
            `decision was ${result.ok ? 'accepted' : result.reason}, expected ${event.expectRefusal}`,
          ]
    }
    if (!result.ok) return [`decision was refused: ${result.reason} ${result.message}`]
    if (result.patch) {
      this.shipment = applyRevision(this.shipment, result.patch)
      await this.agents.orchestrator.submit(this.shipment)
    }
    return []
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

/** Replays a case with its scripted judgements, or with a live judge when one is given. */
export async function replayCase(
  caseFile: CaseFile,
  materialsDirectory: string,
  liveJudge?: SemanticJudge,
): Promise<CaseReplay> {
  const replayer = new CaseReplayer(caseFile, materialsDirectory, liveJudge)
  await replayer.start()
  const steps: StepResult[] = []
  for (const event of caseFile.events) {
    steps.push({ label: event.label, kind: event.kind, problems: await replayer.run(event) })
  }
  await replayer.stop()
  return { caseId: caseFile.shipment.caseId, steps }
}
