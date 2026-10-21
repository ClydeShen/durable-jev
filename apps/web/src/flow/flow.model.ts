import type { CheckResult, GateStatus, HumanTask } from '@durable-jev/contracts'
import type { RuleBranch, RuleDefinition } from '@durable-jev/rule-engine'
import { rootBlockers, upstreamOf } from '../rule-graph.model.js'

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

export type FlowView =
  | { kind: 'overview' }
  | { kind: 'branch'; branch: RuleBranch }
  | { kind: 'all' }

export type WaitingOn = { ruleId: string; role?: string }

export type FlowNodeModel = {
  id: string
  label: string
  kind: 'group' | 'rule'
  status: GateStatus
  evaluatorKind?: RuleDefinition['evaluator']['kind']
  humanRole?: string
  waitingOn: WaitingOn[]
  statusCounts: Partial<Record<GateStatus, number>>
  checks: CheckResult[]
  branch?: RuleBranch
  recheckedAfterChange?: string
}

export type FlowEdgeModel = { from: string; to: string; state: EdgeState }

export type FlowModel = { nodes: FlowNodeModel[]; edges: FlowEdgeModel[] }

export const branchLabels: Record<RuleBranch, string> = {
  base: 'Base checks',
  controlled: 'Controlled goods',
  coldChain: 'Cold chain',
  plan: 'Transport plan',
  commercial: 'Commercial',
  release: 'Release',
}

const overviewMerges: Readonly<Record<string, string>> = { R39: 'R39-CONFIRM' }

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

function unitOf(rule: RuleDefinition, view: FlowView): string | undefined {
  if (view.kind === 'all') return rule.ruleId
  if (view.kind === 'branch') return rule.branch === view.branch ? rule.ruleId : undefined
  if (rule.branch && rule.branch !== 'release') return `branch:${rule.branch}`
  return overviewMerges[rule.ruleId] ?? rule.ruleId
}

export function buildFlowModel(input: {
  rootRuleId: string
  view: FlowView
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
  const ruleStatus = (ruleId: string) =>
    aggregateStatus((checksByRule.get(ruleId) ?? []).map((check) => check.gateStatus))
  const waitingEntry = (ruleId: string): WaitingOn => {
    const role = openTaskRoles.get(ruleId)
    return role === undefined ? { ruleId } : { ruleId, role }
  }

  const relevantRules: RuleDefinition[] = []
  const seen = new Set<string>()
  const pending = [input.rootRuleId]
  while (pending.length > 0) {
    const rule = rulesById.get(pending.pop() as string)
    if (!rule || seen.has(rule.ruleId)) continue
    seen.add(rule.ruleId)
    relevantRules.push(rule)
    pending.push(...upstreamOf(rule))
  }

  const membersByUnit = new Map<string, RuleDefinition[]>()
  for (const rule of relevantRules) {
    const unit = unitOf(rule, input.view)
    if (unit) membersByUnit.set(unit, [...(membersByUnit.get(unit) ?? []), rule])
  }

  const unitOfRule = (ruleId: string) => {
    const rule = rulesById.get(ruleId)
    return rule && unitOf(rule, input.view)
  }
  const leavesUnit = new Set<string>()
  for (const rule of relevantRules) {
    for (const upstreamId of upstreamOf(rule)) {
      if (unitOfRule(upstreamId) !== unitOfRule(rule.ruleId)) leavesUnit.add(upstreamId)
    }
  }
  leavesUnit.add(input.rootRuleId)

  const recheckedAfter = (members: readonly RuleDefinition[]) => {
    const changeIds = members.flatMap((member) =>
      (checksByRule.get(member.ruleId) ?? []).flatMap((check) => check.affectedByChange ?? []),
    )
    return changeIds.length > 0 ? { recheckedAfterChange: changeIds.sort().at(-1) as string } : {}
  }

  const nodes: FlowNodeModel[] = [...membersByUnit.entries()].map(([unit, members]) => {
    const memberStatuses = members.map((member) => ruleStatus(member.ruleId))
    const statusCounts: Partial<Record<GateStatus, number>> = {}
    for (const status of memberStatuses) statusCounts[status] = (statusCounts[status] ?? 0) + 1
    const exits = members.filter((member) => leavesUnit.has(member.ruleId))
    const outcome = aggregateStatus(
      (exits.length > 0 ? exits : members).map((member) => ruleStatus(member.ruleId)),
    )
    const status =
      outcome === 'BLOCKED_DEPENDENCY' && memberStatuses.includes('WAITING_HUMAN')
        ? 'WAITING_HUMAN'
        : outcome
    if (unit.startsWith('branch:')) {
      const branch = unit.slice('branch:'.length) as RuleBranch
      return {
        id: unit,
        label: branchLabels[branch],
        kind: 'group',
        branch,
        status,
        statusCounts,
        waitingOn: members
          .filter((member) => ruleStatus(member.ruleId) === 'WAITING_HUMAN')
          .map((member) => waitingEntry(member.ruleId)),
        checks: [],
        ...recheckedAfter(members),
      }
    }
    const rule = members.find((member) => member.ruleId === unit) ?? (members[0] as RuleDefinition)
    const checks = checksByRule.get(rule.ruleId) ?? []
    const blockedBy = [...new Set(checks.flatMap((check) => check.blockedBy as string[]))]
    const humanRole = openTaskRoles.get(rule.ruleId) ?? rule.humanGate?.requiredRole
    return {
      id: unit,
      label: rule.title ?? rule.ruleId,
      kind: 'rule',
      status,
      statusCounts,
      evaluatorKind: rule.evaluator.kind,
      ...(humanRole === undefined ? {} : { humanRole }),
      waitingOn: rootBlockers(blockedBy, checksByRule).map(waitingEntry),
      checks,
      ...(rule.branch === undefined ? {} : { branch: rule.branch }),
      ...recheckedAfter([rule]),
    }
  })

  const visibleNodes = nodes.filter(
    (node) => input.showNotApplicable || node.status !== 'NOT_APPLICABLE',
  )
  const visibleIds = new Set(visibleNodes.map((node) => node.id))
  const statusById = new Map(visibleNodes.map((node) => [node.id, node.status]))
  const edgeKeys = new Set<string>()
  const edges: FlowEdgeModel[] = []
  for (const rule of relevantRules) {
    const to = unitOf(rule, input.view)
    for (const upstreamId of upstreamOf(rule)) {
      const upstream = rulesById.get(upstreamId)
      const from = upstream && unitOf(upstream, input.view)
      if (!from || !to || from === to || !visibleIds.has(from) || !visibleIds.has(to)) continue
      const key = `${from}->${to}`
      if (edgeKeys.has(key)) continue
      edgeKeys.add(key)
      edges.push({ from, to, state: edgeStateFor(statusById.get(from) as GateStatus) })
    }
  }
  return { nodes: visibleNodes, edges: withoutRedundantEdges(edges) }
}
