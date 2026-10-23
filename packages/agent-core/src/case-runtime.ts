import type {
  AgentId,
  HumanTask,
  HumanTaskTarget,
  RuleEngineKind,
  Shipment,
} from '@durable-jev/contracts'
import { type Decision, decideHumanTask, type HumanAction } from '@durable-jev/human-tasks'
import type { SemanticJudge } from '@durable-jev/model-providers'
import {
  type CaseFacts,
  type EntityChange,
  evaluateRuleGraph,
  invalidateDependentsOf,
  invalidationTriggers,
  type LeafEvaluator,
  type RuleDefinition,
  type RuleOutcome,
  scopeKey,
} from '@durable-jev/rule-engine'
import type { CaseRecord, CaseStore } from './case-store.js'
import { HumanGateSession } from './human-gate.js'
import { RecordingJudge } from './recording-judge.js'
import type { RulePack } from './rule-pack.js'
import { semanticEvaluator } from './semantic-evaluator.js'

export interface CaseRuntimeOptions {
  agentId?: AgentId
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

class CaseNotFoundError extends Error {
  constructor(readonly caseId: string) {
    super(`case ${caseId} does not exist`)
    this.name = 'CaseNotFoundError'
  }
}

const pureKinds: ReadonlySet<RuleEngineKind> = new Set([
  'expression',
  'decisionTable',
  'combinator',
])

const chainIdOf = (task: HumanTask) => task.humanTaskId.slice(0, task.humanTaskId.lastIndexOf('#'))

function changedOutcomes(previous: readonly RuleOutcome[], next: readonly RuleOutcome[]) {
  const before = new Map(
    previous.map((outcome) => [`${outcome.ruleId}@${scopeKey(outcome.scope)}`, outcome.status]),
  )
  return next.filter(
    (outcome) => before.get(`${outcome.ruleId}@${scopeKey(outcome.scope)}`) !== outcome.status,
  )
}

function taskEventName(task: HumanTask, gates: HumanGateSession): string {
  if (task.status !== 'OPEN') return 'human_task.closed'
  return gates.wasCarried(task) ? 'human_task.carried_forward' : 'human_task.opened'
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
      const previous = store.caseRecord(shipment.caseId)?.shipment
      const change = previous ? this.changeBetween(previous, shipment) : undefined
      store.transaction(() => {
        store.putCase(shipment, now())
        store.record({
          caseId: shipment.caseId,
          eventName: 'case.submitted',
          payload: { correlationId: shipment.correlationId, caseRevision: shipment.caseRevision },
        })
      })
      return this.evaluateNow(shipment.caseId, change)
    })
  }

  evaluate(caseId: string, foreign?: readonly RuleOutcome[]): Promise<CaseView> {
    return this.serialized(caseId, () => {
      if (foreign) this.options.store.replaceForeignOutcomes(caseId, foreign)
      return this.evaluateNow(caseId)
    })
  }

  /**
   * Evaluates the pure rules (expressions, tables, combinators) against a candidate shipment
   * without storing anything. Semantic, human and code rules keep their current outcomes.
   */
  async whatIf(candidate: Shipment): Promise<RuleOutcome[]> {
    const { store, rulePack, factsOf } = this.options
    const current = [
      ...store.outcomes(candidate.caseId),
      ...store.foreignOutcomes(candidate.caseId),
    ]
    const graph = await evaluateRuleGraph(
      rulePack.ruleSet,
      factsOf(candidate),
      { evaluators: new Map(), parameters: rulePack.parameters },
      { provided: current, executes: (rule) => pureKinds.has(rule.evaluator.kind) },
    )
    return graph.outcomes
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
          payload: {
            humanTaskId,
            ruleId: task.ruleId,
            status: decision.task.status,
            actor: 'actor' in action ? action.actor : undefined,
          },
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

  private evaluatorsFor(gates: HumanGateSession, judge: SemanticJudge): Map<string, LeafEvaluator> {
    const semantic = semanticEvaluator(judge)
    return new Map(
      this.options.rulePack.ruleSet.rules.flatMap((rule) => {
        const evaluator = this.evaluatorFor(rule, gates, semantic)
        return evaluator ? [[rule.evaluator.ref, evaluator] as const] : []
      }),
    )
  }

  private changeBetween(previous: Shipment, next: Shipment): EntityChange | undefined {
    const [before, after] = [this.options.factsOf(previous), this.options.factsOf(next)]
    const entities = invalidationTriggers.filter(
      (trigger) => before.entityVersions[trigger] !== after.entityVersions[trigger],
    )
    return entities.length > 0 ? { changeId: `r${next.caseRevision}`, entities } : undefined
  }

  private async evaluateNow(caseId: string, change?: EntityChange): Promise<CaseView> {
    const { store, rulePack, factsOf, now } = this.options
    const before = this.view(caseId)
    const affected = change ? invalidateDependentsOf(rulePack.ruleSet, change) : new Set<string>()
    const shipment = before.record.shipment
    const gates = new HumanGateSession(shipment, before.tasks, now())
    const judge = new RecordingJudge(this.options.judgeFor(shipment))
    const graph = await evaluateRuleGraph(
      rulePack.ruleSet,
      factsOf(shipment),
      { evaluators: this.evaluatorsFor(gates, judge), parameters: rulePack.parameters },
      {
        previous: before.outcomes,
        provided: store.foreignOutcomes(caseId),
        executes: (rule) =>
          this.options.agentId === undefined || rule.owner === this.options.agentId,
      },
    )
    gates.reconcile(graph.outcomes)
    const changeLabel = change && `${change.changeId} (${change.entities.join(', ')})`
    const earlierLabels = new Map(
      before.outcomes.map((outcome) => [
        `${outcome.ruleId}@${scopeKey(outcome.scope)}`,
        outcome.invalidatedBy,
      ]),
    )
    const labelOf = (outcome: RuleOutcome) => {
      if (!changeLabel) return earlierLabels.get(`${outcome.ruleId}@${scopeKey(outcome.scope)}`)
      return affected.has(outcome.ruleId) && !outcome.reused ? changeLabel : undefined
    }
    const outcomes = graph.outcomes.map((outcome) => {
      const invalidatedBy = labelOf(outcome)
      const { invalidatedBy: _stale, ...rest } = outcome
      return invalidatedBy ? { ...rest, invalidatedBy } : rest
    })
    const written = store.transaction(() => {
      const current = store.caseRecord(caseId)
      if (current?.shipment.caseRevision !== shipment.caseRevision) return false
      store.replaceOutcomes(caseId, outcomes)
      for (const outcome of before.outcomes.filter((candidate) => affected.has(candidate.ruleId))) {
        store.record({
          caseId,
          eventName: 'result.invalidated',
          payload: {
            ruleId: outcome.ruleId,
            scope: outcome.scope,
            previousStatus: outcome.status,
            change: changeLabel,
          },
        })
      }
      store.putTasks(gates.changes())
      for (const outcome of changedOutcomes(before.outcomes, outcomes)) {
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
      for (const answer of judge.answers) {
        store.record({
          caseId,
          eventName: 'jev.completed',
          payload: {
            questionId: answer.questionId,
            provider: answer.provider,
            modelId: answer.modelId,
            promptVersion: answer.promptVersion,
            inputHash: answer.inputHash,
            judgement: answer.judgement,
            usage: answer.usage,
            durationMs: answer.durationMs,
          },
        })
      }
      for (const task of gates.changes()) {
        store.record({
          caseId,
          eventName: taskEventName(task, gates),
          payload: {
            humanTaskId: task.humanTaskId,
            ruleId: task.ruleId,
            status: task.status,
            caseRevision: task.target.caseRevision,
          },
        })
      }
      return true
    })
    return written ? this.view(caseId) : this.evaluateNow(caseId, change)
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
