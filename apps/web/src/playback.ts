import type { CheckScope, CheckStatus, HumanTask, Role } from '@durable-jev/contracts'
import type { RuleOutcome } from '@durable-jev/rule-engine'
import type { TimelineEntry } from './api'
import { checkStatusLabels, roleLabels } from './labels'
import { toolCallText } from './timeline-text'

export type PlaybackSpeed = 'realtime' | 'fast' | 'medium' | 'slow'

/** Slowest first, as a speed control reads from left to right. */
export const playbackSpeeds: [PlaybackSpeed, string][] = [
  ['slow', '慢'],
  ['medium', '中'],
  ['fast', '快'],
  ['realtime', '实时（不放动画）'],
]

/** How long each step stays on screen. */
export const stepDelayMs: Record<Exclude<PlaybackSpeed, 'realtime'>, number> = {
  fast: 450,
  medium: 1100,
  slow: 2000,
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
  if (value.kind === 'cargoItem') return `货物 ${value.cargoItemId}`
  if (value.kind === 'leg') return `运输段 ${value.legId}`
  return '整单'
}

const decisionVerbs: Record<string, string> = {
  COMPLETED: '完成了',
  APPROVED: '批准了',
  REJECTED: '拒绝了',
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
      const who = actor ? `${roleLabels[actor.role]} ${actor.id}` : '有人'
      const verb = decisionVerbs[String(payload.status)] ?? '处理了'
      return {
        upTo: index,
        text: `${who} ${verb} ${ruleId}「${title}」的任务`,
        ruleIds: [ruleId],
        tone: 'task',
      }
    }
    case 'rule.evaluated': {
      const status = payload.status as CheckStatus
      return {
        upTo: index,
        text: `${ruleId}「${title}」（${scopeText(payload.scope)}）判断：${checkStatusLabels[status]}`,
        ruleIds: [ruleId],
        tone: 'rule',
        status,
      }
    }
    case 'jev.completed':
      return {
        upTo: index,
        text: `Jev 回答了 ${payload.questionId} 的问题`,
        ruleIds: [String(payload.questionId)],
        tone: 'info',
      }
    case 'human_task.opened':
      return {
        upTo: index,
        text: `${ruleId}「${title}」开出人工任务，等人处理`,
        ruleIds: [ruleId],
        tone: 'task',
      }
    case 'human_task.carried_forward':
      return {
        upTo: index,
        text: `${ruleId}「${title}」需要的资料没变：人工任务转到 r${payload.caseRevision}，继续等人处理`,
        ruleIds: [ruleId],
        tone: 'task',
      }
    case 'case.dispatched':
      return {
        upTo: index,
        text: `调度员 ${payload.confirmedBy} 确认发运`,
        ruleIds: [],
        tone: 'info',
      }
    case 'investigation.started':
      return {
        upTo: index,
        text: `${(payload.incident as { legId?: string } | undefined)?.legId ?? ''} 的承运商取消：运输计划 agent 启动调查助手找替代运力`,
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
        text: '调查助手提出改派建议（见上方调查卡片），等运输计划员确认；确认之前订单不变',
        ruleIds: [],
        tone: 'info',
      }
    case 'investigation.confirmed':
      return {
        upTo: index,
        text: '运输计划员确认改派：订单生成新的资料版本，用到路线、承运商、报价的规则要重新判断',
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
    ? '订单协调 agent 收到新订单，各 agent 从第一条规则开始逐条判断'
    : `订单资料版本 r${caseRevision} 交给各 agent 评估`
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
        previous.text = `资料变更（${entry.payload.change}）：${new Set(previous.ruleIds).size} 条规则的结果失效，需要重新判断`
      } else {
        steps.push({
          upTo: index,
          text: `资料变更（${entry.payload.change}）：${entry.payload.ruleId} 的结果失效，需要重新判断`,
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
    text: `${task.ruleId} 等${roleLabels[task.requiredRole]}`,
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
    ...failed.map((ruleId) => `${ruleId} 不通过`),
  ]
  return {
    upTo: -1,
    final: true,
    roles: [...new Set(openTasks.map((task) => task.requiredRole))],
    tone: parts.length > 0 ? 'task' : 'rule',
    ruleIds: [...new Set([...waiting.map((item) => item.ruleId), ...failed])],
    text: parts.length > 0 ? `现在停在：${parts.join('；')}` : '没有待办，也没有不通过的规则',
  }
}
