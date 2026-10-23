import type { CheckScope, CheckStatus } from '@durable-jev/contracts'
import type { TimelineEntry } from './api'
import { checkStatusLabels } from './labels'

export const eventLabels: Record<string, string> = {
  'case.submitted': 'Order received',
  'rule.evaluated': 'Rule result',
  'result.invalidated': 'Result invalidated',
  'jev.completed': 'Jev decided',
  'human_task.opened': 'Task opened',
  'human_task.decided': 'Person acted',
  'human_task.closed': 'Task closed',
  'human_task.carried_forward': 'Task carried to new revision',
  'investigation.started': 'Investigation started',
  'investigation.tool_called': 'Helper looked something up',
  'investigation.proposed': 'Helper proposed',
  'investigation.escalated': 'Handed to a person',
  'investigation.confirmed': 'Reroute confirmed',
  'investigation.rejected': 'Reroute rejected',
  'investigation.stale': 'Proposal out of date',
  'case.dispatched': 'Dispatched',
}

/** Payload fields a person reads to judge what happened, with their names. */
export const fieldLabels: Record<string, string> = {
  ruleId: 'Rule',
  scope: 'Scope',
  status: 'Status',
  previousStatus: 'Previous status',
  change: 'Change',
  caseRevision: 'Revision',
  judgement: "Jev's judgement",
  durationMs: 'Took',
  actor: 'By',
  incident: 'Incident',
  tool: 'Tool',
  args: 'Arguments',
  blocked: 'Blocked because',
  proposal: 'Proposal',
  rationale: 'Reasoning',
  checks: 'Rule pre-checks',
  escalation: 'Handed over because',
  decidedBy: 'Decided by',
  confirmedBy: 'Confirmed by',
  legId: 'Leg',
  offerId: 'Capacity offer',
  carrierId: 'Carrier',
  vehicleId: 'Vehicle',
  plannedDeparture: 'Planned departure',
  plannedArrival: 'Planned arrival',
  extraCostCents: 'Extra cost',
  role: 'Role',
  id: 'Name',
  at: 'Time',
  type: 'Type',
  title: 'Title',
}

/** Identifiers and bookkeeping: kept for the record, shown small. */
export const technicalFields = new Set([
  'correlationId',
  'questionId',
  'promptVersion',
  'inputHash',
  'provider',
  'modelId',
  'usage',
  'humanTaskId',
  'investigationId',
])

export const taskStatusLabels: Record<string, string> = {
  OPEN: 'Open',
  COMPLETED: 'Completed',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
  SUPERSEDED: 'Replaced by a new revision',
}

export function scopeText(scope: unknown): string {
  // Scopes come as objects in rule events and as "leg:LEG-1" strings in pre-check results.
  const value =
    typeof scope === 'string'
      ? Object.fromEntries([
          ['kind', scope.split(':')[0]],
          ['id', scope.split(':')[1]],
        ])
      : (scope as (CheckScope & { id?: string }) | undefined)
  if (value?.kind === 'cargoItem') return `item ${value.cargoItemId ?? value.id}`
  if (value?.kind === 'leg') return `leg ${value.legId ?? value.id}`
  return 'whole order'
}

const statusText = (status: unknown) => checkStatusLabels[status as CheckStatus] ?? String(status)

export function jevAnswer(judgement: unknown): string {
  const value = judgement as {
    choice?: string
    probability?: number
    probabilities?: Record<string, number>
  }
  if (value.choice)
    return `${value.choice} (confidence ${value.probabilities?.[value.choice] ?? '?'})`
  if (value.probability !== undefined) return `holds with confidence ${value.probability}`
  return 'answered'
}

/** What the investigation helper did with one tool call, in words. */
export function toolCallText(tool: unknown, args: unknown, blocked?: unknown): string {
  const input = (args ?? {}) as { legId?: string; offerId?: string; decision?: string }
  if (blocked) return `The helper tried to call ${String(tool)} and was blocked: ${String(blocked)}`
  switch (tool) {
    case 'get_case':
      return 'The helper reads the order'
    case 'search_capacity_offers':
      return `The helper searches spare capacity for ${input.legId ?? ''}`
    case 'check_plan':
      return `The helper pre-checks offer ${input.offerId ?? ''} against the rules (a trial run; the order does not change)`
    case 'submit_investigation_result':
      return input.decision === 'escalate'
        ? 'The helper submits its finding: no offer passes, handed to a person'
        : `The helper submits its finding: reroute to ${input.offerId ?? ''}`
    default:
      return `The helper calls ${String(tool)}`
  }
}

/** One line a person understands at a glance. */
export function summary(entry: TimelineEntry, titles: ReadonlyMap<string, string>): string {
  const payload = entry.payload
  const rule = `${payload.ruleId} "${titles.get(String(payload.ruleId)) ?? ''}"`
  switch (entry.eventName) {
    case 'case.submitted':
      return `Evaluation of revision r${payload.caseRevision} starts`
    case 'rule.evaluated':
      return `${rule} (${scopeText(payload.scope)}): ${statusText(payload.status)}`
    case 'result.invalidated':
      return `${rule} (${scopeText(payload.scope)}) must be decided again after ${payload.change}`
    case 'jev.completed':
      return `${payload.questionId} "${titles.get(String(payload.questionId)) ?? ''}": ${jevAnswer(payload.judgement)}`
    case 'human_task.decided': {
      const actor = payload.actor as { id?: string } | undefined
      return `${actor?.id ?? ''} ${taskStatusLabels[String(payload.status)] ?? payload.status} ${rule}`
    }
    case 'human_task.carried_forward':
      return `${rule}: its inputs did not change, so the task moves to r${payload.caseRevision} and can still be done`
    case 'human_task.opened':
    case 'human_task.closed':
      return `${rule}: ${taskStatusLabels[String(payload.status)] ?? payload.status}`
    case 'investigation.started':
      return `The carrier of ${(payload.incident as { legId?: string } | undefined)?.legId ?? ''} cancelled; searching for a replacement`
    case 'investigation.tool_called':
      return toolCallText(payload.tool, payload.args, payload.blocked)
    case 'investigation.proposed':
      return `Proposes rerouting to ${(payload.proposal as { offerId?: string } | undefined)?.offerId ?? ''}`
    case 'investigation.escalated':
      return String(payload.escalation)
    case 'investigation.confirmed':
    case 'investigation.rejected':
      return `Decided by ${(payload.decidedBy as { id?: string } | undefined)?.id ?? ''}`
    case 'case.dispatched':
      return `${payload.confirmedBy} confirmed dispatch of revision r${payload.caseRevision}`
    default:
      return ''
  }
}
