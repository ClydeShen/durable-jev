import type { CheckScope, CheckStatus, HumanTask, Role } from '@durable-jev/contracts'
import type { RuleOutcome } from '@durable-jev/rule-engine'
import type { TimelineEntry } from './api'
import { checkStatusLabels, roleLabels } from './labels'
import { toolCallText } from './timeline-text'

export type PlaybackSpeed = 'realtime' | 'fast' | 'medium' | 'slow'

/** Slowest first, as a speed control reads from left to right. */
export const playbackSpeeds: [PlaybackSpeed, string][] = [
  ['slow', 'Slow'],
  ['medium', 'Medium'],
  ['fast', 'Fast'],
  ['realtime', 'Real time (no animation)'],
]

/** How long each step stays on screen. */
export const stepDelayMs: Record<Exclude<PlaybackSpeed, 'realtime'>, number> = {
  fast: 1200,
  medium: 2000,
  slow: 3200,
}

/** One thing that happened, shown on the rule graph: what it was and which rules it touched. */
export interface PlaybackStep {
  /** Index of the last timeline entry this step covers. */
  upTo: number
  text: string
  ruleIds: string[]
  tone: 'task' | 'rule' | 'invalidated' | 'info'
  status?: CheckStatus
  /** The closing step: where the case stands once everything has played. */
  final?: boolean
  /** The roles the closing step says the case waits for, so the presenter can switch to them. */
  roles?: Role[]
}

function keyOf(ruleId: unknown, scope: unknown): string {
  const value = scope as CheckScope
  if (value.kind === 'cargoItem') return `${String(ruleId)}@cargoItem:${value.cargoItemId}`
  if (value.kind === 'leg') return `${String(ruleId)}@leg:${value.legId}`
  return `${String(ruleId)}@order`
}

function scopeText(scope: unknown): string {
  const value = scope as CheckScope
  if (value.kind === 'cargoItem') return `item ${value.cargoItemId}`
  if (value.kind === 'leg') return `leg ${value.legId}`
  return 'whole order'
}

const decisionVerbs: Record<string, string> = {
  COMPLETED: 'completed',
  APPROVED: 'approved',
  REJECTED: 'rejected',
}

function stepFor(
  entry: TimelineEntry,
  index: number,
  titles: ReadonlyMap<string, string>,
): PlaybackStep | undefined {
  const payload = entry.payload
  const ruleId = String(payload.ruleId ?? '')
  const title = titles.get(ruleId) ?? ''
  switch (entry.eventName) {
    case 'human_task.decided': {
      const actor = payload.actor as { id: string; role: Role } | undefined
      const who = actor ? `${roleLabels[actor.role]} ${actor.id}` : 'Someone'
      const verb = decisionVerbs[String(payload.status)] ?? 'handled'
      return {
        upTo: index,
        text: `${who} ${verb} the task of ${ruleId} "${title}"`,
        ruleIds: [ruleId],
        tone: 'task',
      }
    }
    case 'rule.evaluated': {
      const status = payload.status as CheckStatus
      return {
        upTo: index,
        text: `${ruleId} "${title}" (${scopeText(payload.scope)}): ${checkStatusLabels[status]}`,
        ruleIds: [ruleId],
        tone: 'rule',
        status,
      }
    }
    case 'jev.completed':
      return {
        upTo: index,
        text: `Jev answered the question of ${payload.questionId}`,
        ruleIds: [String(payload.questionId)],
        tone: 'info',
      }
    case 'human_task.opened':
      return {
        upTo: index,
        text: `${ruleId} "${title}" opens a task and waits for a person`,
        ruleIds: [ruleId],
        tone: 'task',
      }
    case 'human_task.carried_forward':
      return {
        upTo: index,
        text: `${ruleId} "${title}": its inputs did not change, so its task moves to r${payload.caseRevision} and still waits for a person`,
        ruleIds: [ruleId],
        tone: 'task',
      }
    case 'case.dispatched':
      return {
        upTo: index,
        text: `Dispatcher ${payload.confirmedBy} confirms dispatch`,
        ruleIds: [],
        tone: 'info',
      }
    case 'investigation.started':
      return {
        upTo: index,
        text: `The carrier of ${(payload.incident as { legId?: string } | undefined)?.legId ?? ''} cancelled: the transport planning agent starts its investigation helper to find a replacement`,
        ruleIds: [],
        tone: 'info',
      }
    case 'investigation.tool_called':
      return {
        upTo: index,
        text: toolCallText(payload.tool, payload.args, payload.blocked),
        ruleIds: [],
        tone: 'info',
      }
    case 'investigation.proposed':
      return {
        upTo: index,
        text: 'The helper proposes a reroute (see the investigation card above) and waits for the transport planner; the order does not change until then',
        ruleIds: [],
        tone: 'info',
      }
    case 'investigation.confirmed':
      return {
        upTo: index,
        text: 'The transport planner confirms the reroute: the order gets a new revision, and rules that use the route, carrier or quote are decided again',
        ruleIds: [],
        tone: 'info',
      }
    default:
      return undefined
  }
}

/** A revision handed to the agents; the first one is the order arriving. */
function submittedText(caseRevision: number): string {
  return caseRevision === 1
    ? 'Order coordination receives the new order; every agent decides its rules one by one from the first'
    : `Revision r${caseRevision} goes to every agent`
}

/**
 * The steps to show for the timeline entries after `from`. Invalidations caused by one change
 * play as one step; the order receiving a new revision plays once, not once per agent.
 */
export function playbackSteps(
  entries: readonly TimelineEntry[],
  from: number,
  titles: ReadonlyMap<string, string>,
): PlaybackStep[] {
  const steps: PlaybackStep[] = []
  for (let index = from + 1; index < entries.length; index++) {
    const entry = entries[index] as TimelineEntry
    const previous = steps.at(-1)
    if (entry.eventName === 'result.invalidated') {
      if (previous?.tone === 'invalidated') {
        previous.upTo = index
        previous.ruleIds.push(String(entry.payload.ruleId))
        previous.text = `Change ${entry.payload.change}: ${new Set(previous.ruleIds).size} results are invalidated and will be decided again`
      } else {
        steps.push({
          upTo: index,
          text: `Change ${entry.payload.change}: the result of ${entry.payload.ruleId} is invalidated and will be decided again`,
          ruleIds: [String(entry.payload.ruleId)],
          tone: 'invalidated',
        })
      }
      continue
    }
    if (entry.eventName === 'case.submitted') {
      if (entry.agentId === 'order-coordination') {
        steps.push({
          upTo: index,
          text: submittedText(Number(entry.payload.caseRevision)),
          ruleIds: [],
          tone: 'info',
        })
      } else if (previous) previous.upTo = index
      continue
    }
    const step = stepFor(entry, index, titles)
    if (step) steps.push(step)
    else if (previous) previous.upTo = index
  }
  return steps
}

/**
 * The outcomes as they stood once the entries up to `upTo` had happened. Statuses come from the
 * event history; a rule whose events are all shown keeps its live outcome. An invalidated result
 * that was confirmed unchanged has no later event, so it returns to its previous status.
 */
export function outcomesAt(
  entries: readonly TimelineEntry[],
  upTo: number,
  live: readonly RuleOutcome[],
): RuleOutcome[] {
  const pending = new Set(
    entries
      .slice(upTo + 1)
      .filter(
        (entry) => entry.eventName === 'rule.evaluated' || entry.eventName === 'result.invalidated',
      )
      .map((entry) => keyOf(entry.payload.ruleId, entry.payload.scope)),
  )
  if (pending.size === 0) return [...live]
  const statuses = new Map<string, CheckStatus>()
  entries.slice(0, upTo + 1).forEach((entry, index) => {
    const key = () => keyOf(entry.payload.ruleId, entry.payload.scope)
    if (entry.eventName === 'rule.evaluated')
      statuses.set(key(), entry.payload.status as CheckStatus)
    if (entry.eventName === 'result.invalidated') {
      const reevaluated = entries
        .slice(index + 1)
        .some(
          (later) =>
            later.eventName === 'rule.evaluated' &&
            keyOf(later.payload.ruleId, later.payload.scope) === key(),
        )
      statuses.set(
        key(),
        reevaluated ? 'INVALIDATED' : (entry.payload.previousStatus as CheckStatus),
      )
    }
  })
  return live.flatMap((outcome) => {
    const key = keyOf(outcome.ruleId, outcome.scope)
    if (!pending.has(key)) return [outcome]
    const status = statuses.get(key)
    return status ? [{ ...outcome, status }] : []
  })
}

/**
 * Where the case stands now: the open human tasks and who must act, and the rules that failed.
 * Shown after the last step, so the audience sees what moved and where it stopped.
 */
export function whereItStands(
  outcomes: readonly RuleOutcome[],
  openTasks: readonly HumanTask[],
): PlaybackStep {
  const waiting = openTasks.map((task) => ({
    ruleId: task.ruleId,
    text: `${task.ruleId} waits for the ${roleLabels[task.requiredRole].toLowerCase()}`,
  }))
  const failed = [
    ...new Set(
      outcomes
        .filter((outcome) => outcome.status === 'FAIL' || outcome.status === 'ERROR')
        .map((outcome) => outcome.ruleId),
    ),
  ]
  const parts = [
    ...new Set(waiting.map((item) => item.text)),
    ...failed.map((ruleId) => `${ruleId} failed`),
  ]
  return {
    upTo: -1,
    final: true,
    roles: [...new Set(openTasks.map((task) => task.requiredRole))],
    tone: parts.length > 0 ? 'task' : 'rule',
    ruleIds: [...new Set([...waiting.map((item) => item.ruleId), ...failed])],
    text:
      parts.length > 0
        ? `Where it stands: ${parts.join('; ')}`
        : 'No open tasks and no failed rules',
  }
}
