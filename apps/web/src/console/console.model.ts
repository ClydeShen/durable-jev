import type {
  BusinessEvent,
  ObservabilityEvent,
  SpanRecord,
  StoredEvent,
} from '@durable-jev/contracts'

export type CaseSummary = {
  correlationId: string
  caseId: string
  orderStatus?: string
  eventCount: number
  errorCount: number
  services: string[]
  firstAt: string
  lastAt: string
  lastEventName: string
  totalMs: number
  machineMs: number
  humanWaitMs: number
}

export type EventCategory =
  | 'code'
  | 'jev'
  | 'tool'
  | 'service'
  | 'human'
  | 'agent'
  | 'recovery'
  | 'order'

export const categoryLabels: Record<EventCategory, string> = {
  code: 'Code rule',
  jev: 'Jev',
  tool: 'Tool',
  service: 'Service call',
  human: 'Person',
  agent: 'Agent',
  recovery: 'Recovery',
  order: 'Order',
}

const recoveryNames = new Set([
  'run.interrupted',
  'run.resumed',
  'result.invalidated',
  'operation.deduplicated',
  'task.failed',
])

export const categoryOf = (event: BusinessEvent): EventCategory => {
  if (recoveryNames.has(event.eventName)) return 'recovery'
  switch (event.eventName) {
    case 'rule.evaluated': {
      const evaluator = event.attributes?.evaluator
      return evaluator === 'semantic' ? 'jev' : evaluator === 'humanGate' ? 'human' : 'code'
    }
    case 'jev.requested':
    case 'jev.completed':
      return 'jev'
    case 'tool.started':
    case 'tool.completed':
      return 'tool'
    case 'task.dispatched':
    case 'task.accepted':
      return 'service'
    case 'information.requested':
    case 'information.received':
      return 'human'
    case 'run.started':
    case 'run.completed':
    case 'run.escalated':
    case 'case.recommended':
      return 'agent'
    default:
      return 'order'
  }
}

const text = (value: unknown) => (value === undefined || value === null ? undefined : String(value))

// One line saying what happened, from the fields that matter for this kind of event.
export const describeEvent = (event: BusinessEvent): string => {
  const a = event.attributes ?? {}
  switch (event.eventName) {
    case 'case.submitted':
      return `Order submitted: ${text(a.cargoItems)} item(s), ${text(a.legs)} leg(s)`
    case 'rule.evaluated':
      return `${text(a.ruleId)}${a.entityId && a.entityId !== 'order' ? ` for ${text(a.entityId)}` : ''}: ${text(a.previousStatus)} to ${event.status}`
    case 'jev.requested':
      return `Asked ${text(a.provider)} about ${text(a.ruleId)}${a.entityId && a.entityId !== 'order' ? ` (${text(a.entityId)})` : ''}`
    case 'jev.completed':
      return `${text(a.provider)} answered ${text(a.ruleId)}: ${describeAnswer(a.answer)}`
    case 'task.dispatched':
      return `Asked ${text(a.evaluator)} to check ${Array.isArray(a.branches) ? a.branches.join(', ') : ''}`
    case 'task.accepted':
      return `${text(a.service)} accepted the check`
    case 'task.failed':
      return `Failed: ${text(event.errorCode)}${a.message ? `, ${text(a.message)}` : ''}`
    case 'information.requested':
      return `Waiting for ${text(a.requiredRole)}: ${text(a.ruleId)}`
    case 'information.received':
      return `${text(a.actor)} ${text(a.action)}: ${text(a.ruleId)}`
    case 'order.status_changed':
      return `Order moved from ${text(a.from)} to ${text(a.to)}`
    case 'change.applied':
      return `Plan changed (${text(a.kind)}) by ${text(a.actor)}`
    case 'result.invalidated':
      return `Results invalidated: ${Array.isArray(a.ruleIds) ? a.ruleIds.join(', ') : text(a.reason)}`
    case 'run.started':
      return 'Agent run started'
    case 'run.interrupted':
      return 'Agent run interrupted'
    case 'run.resumed':
      return a.scope === 'coordinator'
        ? `Coordinator restarted; still waiting for ${Array.isArray(a.openHumanTasks) ? a.openHumanTasks.join(', ') : 'people'}`
        : `Agent run resumed (attempt ${event.attempt ?? '?'})`
    case 'run.completed':
      return 'Agent run completed'
    case 'run.escalated':
      return `Agent run escalated: ${text(a.reason)}`
    case 'tool.completed':
      return `Tool ${text(a.toolName)} ${event.status ?? ''}`.trim()
    case 'case.recommended':
      return `Agent proposed ${text(a.carrierId)} with ${text(a.vehicleId)} (not applied)`
    default:
      return event.eventName
  }
}

export const describeAnswer = (answer: unknown): string => {
  const value = answer as { type?: string; noul?: number; choice?: string } | undefined
  if (value?.type === 'noul') return `noul ${value.noul}`
  if (value?.type === 'choice') return `choice ${value.choice}`
  return 'unknown'
}

// Services deliver independently, so arrival order is not time order: sort by time, and keep
// arrival order for events with the same timestamp.
export const businessEvents = (events: readonly StoredEvent[]): BusinessEvent[] =>
  events
    .flatMap(({ event, sequence }) => (event.kind === 'event' ? [{ event, sequence }] : []))
    .sort(
      (left, right) =>
        left.event.timestamp.localeCompare(right.event.timestamp) || left.sequence - right.sequence,
    )
    .map(({ event }) => event)
export const spanRecords = (events: readonly StoredEvent[]): SpanRecord[] =>
  events.flatMap(({ event }) => (event.kind === 'span' ? [event] : []))

export type CallRow = {
  span: SpanRecord
  depth: number
  // Where this span starts, in ms from the start of its trace, and how long it ran.
  offsetMs: number
  // The parent was never stored (a request without a case, or a killed process).
  orphan: boolean
}

export type TraceView = {
  traceId: string
  startedAt: string
  durationMs: number
  rows: CallRow[]
  // Other traces this one links to (a resumed run, a late answer).
  links: { fromSpanId: string; traceId: string; spanId: string; relation: string }[]
}

export const buildTraces = (spans: readonly SpanRecord[]): TraceView[] => {
  const byTrace = Map.groupBy(spans, (span) => span.traceId)
  const traces: TraceView[] = []
  for (const [traceId, members] of byTrace) {
    const ids = new Set(members.map((span) => span.spanId))
    const children = Map.groupBy(
      members.filter((span) => span.parentSpanId && ids.has(span.parentSpanId)),
      (span) => span.parentSpanId as string,
    )
    const start = Math.min(...members.map((span) => Date.parse(span.startedAt)))
    const end = Math.max(
      ...members.map((span) => Date.parse(span.startedAt) + (span.durationMs ?? 0)),
    )
    const rows: CallRow[] = []
    const visit = (span: SpanRecord, depth: number, orphan: boolean) => {
      rows.push({ span, depth, offsetMs: Date.parse(span.startedAt) - start, orphan })
      for (const child of (children.get(span.spanId) ?? []).sort(byStart))
        visit(child, depth + 1, false)
    }
    const roots = members
      .filter((span) => !span.parentSpanId || !ids.has(span.parentSpanId))
      .sort(byStart)
    for (const root of roots) visit(root, 0, root.parentSpanId !== undefined)
    traces.push({
      traceId,
      startedAt: new Date(start).toISOString(),
      durationMs: end - start,
      rows,
      links: members.flatMap((span) =>
        (span.links ?? []).map((link) => ({ fromSpanId: span.spanId, ...link })),
      ),
    })
  }
  return traces.sort((left, right) => left.startedAt.localeCompare(right.startedAt))
}

const byStart = (left: SpanRecord, right: SpanRecord) =>
  left.startedAt.localeCompare(right.startedAt)

export type Judgement = {
  ruleId: string
  entityId: string
  requested?: BusinessEvent
  completed?: BusinessEvent
  // What the rule made of the answer: the gate status that followed.
  decided?: BusinessEvent
}

// Pairs, per rule and item, what Jev was asked and answered with the rule result that followed.
export const judgements = (events: readonly BusinessEvent[]): Judgement[] => {
  const rows = new Map<string, Judgement>()
  const row = (ruleId: string, entityId: string) => {
    const key = `${ruleId}@${entityId}`
    let found = rows.get(key)
    if (!found) {
      found = { ruleId, entityId }
      rows.set(key, found)
    }
    return found
  }
  for (const event of events) {
    const a = event.attributes ?? {}
    const ruleId = text(a.ruleId)
    const entityId = text(a.entityId)
    if (!ruleId || !entityId) continue
    if (event.eventName === 'jev.requested') row(ruleId, entityId).requested = event
    else if (event.eventName === 'jev.completed') row(ruleId, entityId).completed = event
    else if (event.eventName === 'rule.evaluated' && a.evaluator === 'semantic')
      row(ruleId, entityId).decided = event
  }
  // A rule that was never put to the model has nothing to compare.
  return [...rows.values()].filter((row) => row.requested || row.completed)
}

export const isRecoveryEvent = (event: ObservabilityEvent): boolean =>
  event.kind === 'event' ? categoryOf(event) === 'recovery' : (event.links?.length ?? 0) > 0

export const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  const minutes = Math.floor(ms / 60_000)
  return minutes < 60
    ? `${minutes} min ${Math.round((ms % 60_000) / 1000)} s`
    : `${(ms / 3_600_000).toFixed(1)} h`
}

export type TimelineItem =
  | { kind: 'event'; event: BusinessEvent }
  // A run of rule results that arrived together, e.g. the first evaluation of an order.
  | { kind: 'rules'; events: BusinessEvent[]; counts: Record<string, number> }

const minimumGroup = 4

// Folds consecutive rule results into one row, so the first evaluation does not bury the story.
export const groupTimeline = (events: readonly BusinessEvent[]): TimelineItem[] => {
  const items: TimelineItem[] = []
  let run: BusinessEvent[] = []
  const flush = () => {
    if (run.length >= minimumGroup) {
      const counts: Record<string, number> = {}
      for (const event of run)
        counts[event.status ?? 'unknown'] = (counts[event.status ?? 'unknown'] ?? 0) + 1
      items.push({ kind: 'rules', events: run, counts })
    } else {
      for (const event of run) items.push({ kind: 'event', event })
    }
    run = []
  }
  for (const event of events) {
    if (event.eventName === 'rule.evaluated') run.push(event)
    else {
      flush()
      items.push({ kind: 'event', event })
    }
  }
  flush()
  return items
}

const spanLabels: Record<string, string> = {
  'human.act': 'A person answered',
  'agent.run.resumed': 'Agent run resumed',
}

export const describeSpan = (span: SpanRecord): string =>
  spanLabels[span.eventName] ?? span.eventName
