import type { HumanTask, HumanTaskTarget, Shipment } from '@durable-jev/contracts'
import { type Decision, decideHumanTask, type HumanAction } from '@durable-jev/human-tasks'
import type { SemanticJudge } from '@durable-jev/model-providers'
import {
  type CaseFacts,
  evaluateRuleGraph,
  type LeafEvaluator,
  type RuleDefinition,
  type RuleOutcome,
  scopeKey,
} from '@durable-jev/rule-engine'
import type { CaseRecord, CaseStore } from './case-store.js'
import { HumanGateSession } from './human-gate.js'
import type { RulePack } from './rule-pack.js'
import { semanticEvaluator } from './semantic-evaluator.js'

export interface CaseRuntimeOptions {
  store: CaseStore
  rulePack: RulePack
  judgeFor(shipment: Shipment): SemanticJudge
  codeEvaluators: ReadonlyMap<string, LeafEvaluator>
  factsOf(shipment: Shipment): CaseFacts
  now(): string
}

export interface CaseView {
  record: CaseRecord
  outcomes: RuleOutcome[]
  tasks: HumanTask[]
}

export class CaseNotFoundError extends Error {
  constructor(readonly caseId: string) {
    super(`case ${caseId} does not exist`)
    this.name = 'CaseNotFoundError'
  }
}

const chainIdOf = (task: HumanTask) => task.humanTaskId.slice(0, task.humanTaskId.lastIndexOf('#'))

function changedOutcomes(previous: readonly RuleOutcome[], next: readonly RuleOutcome[]) {
  const before = new Map(
    previous.map((outcome) => [`${outcome.ruleId}@${scopeKey(outcome.scope)}`, outcome.status]),
  )
  return next.filter(
    (outcome) => before.get(`${outcome.ruleId}@${scopeKey(outcome.scope)}`) !== outcome.status,
  )
}

export class CaseRuntime {
  private readonly queues = new Map<string, Promise<unknown>>()

  constructor(private readonly options: CaseRuntimeOptions) {}

  view(caseId: string): CaseView {
    const record = this.options.store.caseRecord(caseId)
    if (!record) throw new CaseNotFoundError(caseId)
    return {
      record,
      outcomes: this.options.store.outcomes(caseId),
      tasks: this.options.store.tasksOf(caseId),
    }
  }

  submit(shipment: Shipment): Promise<CaseView> {
    return this.serialized(shipment.caseId, async () => {
      const { store, now } = this.options
      store.transaction(() => {
        store.putCase(shipment, now())
        store.record({
          caseId: shipment.caseId,
          eventName: 'case.submitted',
          payload: { correlationId: shipment.correlationId, caseRevision: shipment.caseRevision },
        })
      })
      return this.evaluateNow(shipment.caseId)
    })
  }

  evaluate(caseId: string): Promise<CaseView> {
    return this.serialized(caseId, () => this.evaluateNow(caseId))
  }

  decide(humanTaskId: string, action: HumanAction): Promise<Decision> {
    const task = this.options.store.task(humanTaskId)
    if (!task) {
      return Promise.resolve({
        ok: false,
        reason: 'NOT_FOUND',
        message: `task ${humanTaskId} does not exist`,
      })
    }
    return this.serialized(task.caseId, async () => {
      const view = this.view(task.caseId)
      const decision = decideHumanTask(task, action, {
        now: this.options.now(),
        currentTarget: this.currentTarget(view, task),
        chainTasks: view.tasks.filter((other) => chainIdOf(other) === chainIdOf(task)),
      })
      if (!decision.ok) return decision
      const { store } = this.options
      store.transaction(() => {
        store.putTasks([decision.task])
        store.record({
          caseId: task.caseId,
          eventName: 'human_task.decided',
          payload: { humanTaskId, ruleId: task.ruleId, status: decision.task.status },
        })
      })
      await this.evaluateNow(task.caseId)
      return decision
    })
  }

  private currentTarget(view: CaseView, task: HumanTask): HumanTaskTarget {
    const outcome = view.outcomes.find(
      (candidate) =>
        candidate.ruleId === task.ruleId && scopeKey(candidate.scope) === scopeKey(task.scope),
    )
    return {
      caseRevision: view.record.shipment.caseRevision,
      entityVersions: view.record.shipment.entityVersions,
      inputFingerprint: outcome?.inputFingerprint ?? '',
    }
  }

  private evaluatorFor(
    rule: RuleDefinition,
    gates: HumanGateSession,
    semantic: LeafEvaluator,
  ): LeafEvaluator | undefined {
    if (rule.evaluator.kind === 'semantic') return semantic
    if (rule.evaluator.kind === 'humanGate') return gates.evaluator
    return this.options.codeEvaluators.get(rule.evaluator.ref)
  }

  private evaluatorsFor(gates: HumanGateSession, shipment: Shipment): Map<string, LeafEvaluator> {
    const semantic = semanticEvaluator(this.options.judgeFor(shipment))
    return new Map(
      this.options.rulePack.ruleSet.rules.flatMap((rule) => {
        const evaluator = this.evaluatorFor(rule, gates, semantic)
        return evaluator ? [[rule.evaluator.ref, evaluator] as const] : []
      }),
    )
  }

  private async evaluateNow(caseId: string): Promise<CaseView> {
    const { store, rulePack, factsOf, now } = this.options
    const before = this.view(caseId)
    const shipment = before.record.shipment
    const gates = new HumanGateSession(shipment, before.tasks, now())
    const graph = await evaluateRuleGraph(
      rulePack.ruleSet,
      factsOf(shipment),
      { evaluators: this.evaluatorsFor(gates, shipment), parameters: rulePack.parameters },
      { previous: before.outcomes },
    )
    gates.withdrawStale(graph.outcomes)
    const written = store.transaction(() => {
      const current = store.caseRecord(caseId)
      if (current?.shipment.caseRevision !== shipment.caseRevision) return false
      store.replaceOutcomes(caseId, graph.outcomes)
      store.putTasks(gates.changes())
      for (const outcome of changedOutcomes(before.outcomes, graph.outcomes)) {
        store.record({
          caseId,
          eventName: 'rule.evaluated',
          payload: {
            ruleId: outcome.ruleId,
            scope: outcome.scope,
            status: outcome.status,
            caseRevision: shipment.caseRevision,
          },
        })
      }
      for (const task of gates.changes()) {
        store.record({
          caseId,
          eventName: task.status === 'OPEN' ? 'human_task.opened' : 'human_task.closed',
          payload: { humanTaskId: task.humanTaskId, ruleId: task.ruleId, status: task.status },
        })
      }
      return true
    })
    return written ? this.view(caseId) : this.evaluateNow(caseId)
  }

  private serialized<T>(caseId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(caseId) ?? Promise.resolve()
    const next = previous.then(work, work)
    this.queues.set(
      caseId,
      next.catch(() => undefined),
    )
    return next
  }
}
