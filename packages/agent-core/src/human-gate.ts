import type { HumanTask, Role, Shipment } from '@durable-jev/contracts'
import {
  type ChainShape,
  type ChainSteps,
  chainOutcome,
  decideHumanTask,
  gateStatusOf,
  type HumanAction,
  stepsToOpen,
} from '@durable-jev/human-tasks'
import {
  type HumanGate,
  type LeafEvaluation,
  type LeafEvaluator,
  type LeafInput,
  scopeKey,
} from '@durable-jev/rule-engine'

const hoursAfter = (now: string, hours: number) =>
  new Date(Date.parse(now) + hours * 3_600_000).toISOString()

const stepIndexOf = (taskId: string) => Number(taskId.slice(taskId.lastIndexOf('#') + 1))

const roundOf = (taskId: string) => Number(/\/r(\d+)#\d+$/.exec(taskId)?.[1] ?? 0)

export class HumanGateSession {
  private readonly tasks = new Map<string, HumanTask>()
  private readonly changed = new Set<string>()
  readonly evaluator: LeafEvaluator = (input) => this.evaluate(input)

  constructor(
    private readonly shipment: Shipment,
    existing: readonly HumanTask[],
    private readonly now: string,
  ) {
    for (const task of existing) this.tasks.set(task.humanTaskId, task)
  }

  changes(): HumanTask[] {
    return [...this.changed].flatMap((taskId) => this.tasks.get(taskId) ?? [])
  }

  private evaluate(input: LeafInput): LeafEvaluation {
    const gate = input.rule.humanGate
    if (!gate) throw new Error(`${input.rule.ruleId} has no human gate`)
    const roles = this.applicableRoles(gate, input)
    if (!roles) return { status: 'BLOCKED_DEPENDENCY' }
    const shape: ChainShape = { mode: gate.mode, stepCount: roles.length }
    const versionPrefix = `${this.shipment.caseId}/${input.rule.ruleId}/${scopeKey(input.scope)}/${input.inputFingerprint.slice(0, 12)}`
    const chainId = this.currentChain(versionPrefix, shape)
    const opened = stepsToOpen(shape, this.stepsOf(chainId)).map((stepIndex) =>
      this.openStep(input, gate, chainId, shape, stepIndex, roles),
    )
    const [first] = opened
    if (first) this.supersedeEarlierVersions(versionPrefix, first.humanTaskId)
    return {
      status: gateStatusOf(chainOutcome(shape, this.stepsOf(chainId))),
      observedValue: chainId,
    }
  }

  private applicableRoles(gate: HumanGate, input: LeafInput): Role[] | undefined {
    const statuses = gate.steps.map((step) =>
      step.appliesWhen ? input.holds(step.appliesWhen).status : 'PASS',
    )
    const undecided = statuses.some(
      (status) => status !== 'PASS' && status !== 'FAIL' && status !== 'NOT_APPLICABLE',
    )
    if (undecided) return undefined
    return gate.steps
      .filter((_, index) => statuses[index] === 'PASS')
      .map((step) => step.requiredRole)
  }

  private currentChain(versionPrefix: string, shape: ChainShape): string {
    const rounds = [...this.tasks.keys()]
      .filter((taskId) => taskId.startsWith(`${versionPrefix}/`))
      .map(roundOf)
    const round = Math.max(1, ...rounds)
    const chainId = `${versionPrefix}/r${round}`
    this.expireOverdue(chainId)
    const outcome = chainOutcome(shape, this.stepsOf(chainId))
    return outcome.status === 'EXPIRED' || outcome.status === 'ENDED'
      ? `${versionPrefix}/r${round + 1}`
      : chainId
  }

  private stepsOf(chainId: string): ChainSteps {
    return new Map(
      [...this.tasks.values()]
        .filter((task) => task.humanTaskId.startsWith(`${chainId}#`))
        .map((task) => [stepIndexOf(task.humanTaskId), task]),
    )
  }

  private apply(task: HumanTask, action: HumanAction) {
    const decision = decideHumanTask(task, action, { now: this.now, currentTarget: task.target })
    if (decision.ok) this.put(decision.task)
  }

  private expireOverdue(chainId: string) {
    for (const task of this.stepsOf(chainId).values()) {
      if (task.status === 'OPEN' && this.now >= task.expiresAt) this.apply(task, { type: 'expire' })
    }
  }

  private supersedeEarlierVersions(versionPrefix: string, replacementId: string) {
    const instancePrefix = versionPrefix.slice(0, versionPrefix.lastIndexOf('/') + 1)
    for (const task of this.tasks.values()) {
      const earlier =
        task.humanTaskId.startsWith(instancePrefix) &&
        !task.humanTaskId.startsWith(`${versionPrefix}/`)
      if (earlier) this.apply(task, { type: 'supersede', by: replacementId })
    }
  }

  private openStep(
    input: LeafInput,
    gate: HumanGate,
    chainId: string,
    shape: ChainShape,
    stepIndex: number,
    roles: readonly Role[],
  ): HumanTask {
    const task: HumanTask = {
      humanTaskId: `${chainId}#${stepIndex}`,
      caseId: this.shipment.caseId,
      ruleId: input.rule.ruleId,
      scope: input.scope,
      taskType: gate.taskType,
      requiredRole: roles[stepIndex] as Role,
      prerequisites: input.rule.dependsOn,
      evidenceRequirements: gate.evidenceRequirements,
      target: {
        caseRevision: this.shipment.caseRevision,
        entityVersions: this.shipment.entityVersions,
        inputFingerprint: input.inputFingerprint,
      },
      status: 'OPEN',
      createdAt: this.now,
      expiresAt: hoursAfter(this.now, gate.expiresAfterHours),
      ...(gate.taskType === 'APPROVAL'
        ? {
            approvalChain: {
              chainId,
              mode: shape.mode,
              distinctActors: gate.distinctActors,
              stepIndex,
              stepCount: shape.stepCount,
            },
          }
        : {}),
    }
    this.put(task)
    return task
  }

  private put(task: HumanTask) {
    this.tasks.set(task.humanTaskId, task)
    this.changed.add(task.humanTaskId)
  }
}
