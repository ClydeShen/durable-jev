import type { CheckResult, GateStatus, HumanTask } from '@durable-jev/contracts'
import type { RuleDefinition } from '@durable-jev/rule-engine'
import { rootBlockers, upstreamOf } from '../rule-graph.js'

const severityOrder: readonly GateStatus[] = [
  'FAIL',
  'ERROR',
  'WAITING_HUMAN',
  'BLOCKED_DEPENDENCY',
  'UNKNOWN',
  'INVALIDATED',
  'PASS',
  'NOT_APPLICABLE',
]

export type EdgeState = 'flowing' | 'waiting' | 'blocked' | 'failed' | 'inactive'

export type FlowNodeModel = {
  ruleId: string
  status: GateStatus
  evaluatorKind: RuleDefinition['evaluator']['kind']
  humanRole?: string
  waitingOn: string[]
  checks: CheckResult[]
}

export type FlowEdgeModel = { from: string; to: string; state: EdgeState }

export type FlowModel = { nodes: FlowNodeModel[]; edges: FlowEdgeModel[] }

export function aggregateStatus(statuses: readonly GateStatus[]): GateStatus {
  if (statuses.length === 0) return 'UNKNOWN'
  return severityOrder.find((status) => statuses.includes(status)) ?? 'UNKNOWN'
}

export function edgeStateFor(upstreamStatus: GateStatus): EdgeState {
  switch (upstreamStatus) {
    case 'PASS':
      return 'flowing'
    case 'WAITING_HUMAN':
      return 'waiting'
    case 'FAIL':
    case 'ERROR':
      return 'failed'
    case 'NOT_APPLICABLE':
      return 'inactive'
    default:
      return 'blocked'
  }
}

function reachableFrom(
  start: string,
  downstreamOf: ReadonlyMap<string, readonly string[]>,
  skipEdge: { from: string; to: string },
): Set<string> {
  const reached = new Set<string>()
  const pending = [start]
  while (pending.length > 0) {
    const current = pending.pop() as string
    for (const next of downstreamOf.get(current) ?? []) {
      if (current === skipEdge.from && next === skipEdge.to) continue
      if (reached.has(next)) continue
      reached.add(next)
      pending.push(next)
    }
  }
  return reached
}

export function withoutRedundantEdges<Edge extends { from: string; to: string }>(
  edges: readonly Edge[],
): Edge[] {
  const downstreamOf = new Map<string, string[]>()
  for (const edge of edges) {
    downstreamOf.set(edge.from, [...(downstreamOf.get(edge.from) ?? []), edge.to])
  }
  return edges.filter((edge) => !reachableFrom(edge.from, downstreamOf, edge).has(edge.to))
}

export function buildFlowModel(input: {
  rootRuleId: string
  rules: readonly RuleDefinition[]
  checks: readonly CheckResult[]
  humanTasks: readonly HumanTask[]
  showNotApplicable: boolean
}): FlowModel {
  const rulesById = new Map(input.rules.map((rule) => [rule.ruleId as string, rule]))
  const checksByRule = Map.groupBy(input.checks, (check) => check.ruleId as string)
  const openTaskRoles = new Map(
    input.humanTasks
      .filter((task) => task.status === 'OPEN')
      .map((task) => [task.ruleId as string, task.requiredRole as string]),
  )

  const included = new Set<string>()
  const pending = [input.rootRuleId]
  while (pending.length > 0) {
    const ruleId = pending.pop() as string
    const rule = rulesById.get(ruleId)
    if (!rule || included.has(ruleId)) continue
    included.add(ruleId)
    pending.push(...upstreamOf(rule))
  }

  const statusOf = (ruleId: string) =>
    aggregateStatus((checksByRule.get(ruleId) ?? []).map((check) => check.gateStatus))
  const visible = [...included].filter(
    (ruleId) => input.showNotApplicable || statusOf(ruleId) !== 'NOT_APPLICABLE',
  )
  const visibleSet = new Set(visible)

  const nodes = visible.map((ruleId): FlowNodeModel => {
    const rule = rulesById.get(ruleId) as RuleDefinition
    const checks = checksByRule.get(ruleId) ?? []
    const blockedBy = [...new Set(checks.flatMap((check) => check.blockedBy as string[]))]
    const humanRole = openTaskRoles.get(ruleId) ?? rule.humanGate?.requiredRole
    return {
      ruleId,
      status: statusOf(ruleId),
      evaluatorKind: rule.evaluator.kind,
      ...(humanRole === undefined ? {} : { humanRole }),
      waitingOn: rootBlockers(blockedBy, checksByRule),
      checks,
    }
  })

  const edges = withoutRedundantEdges(
    visible.flatMap((ruleId) =>
      upstreamOf(rulesById.get(ruleId) as RuleDefinition)
        .filter((upstreamId) => visibleSet.has(upstreamId))
        .map((upstreamId) => ({
          from: upstreamId,
          to: ruleId,
          state: edgeStateFor(statusOf(upstreamId)),
        })),
    ),
  )
  return { nodes, edges }
}
