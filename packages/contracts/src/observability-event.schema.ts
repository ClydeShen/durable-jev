import { z } from 'zod'

// Business events on the case timeline (PRD 15.3). A span is not listed here: it has its own kind.
export const eventNames = [
  'case.submitted',
  'case.recommended',
  'task.dispatched',
  'task.accepted',
  'task.failed',
  'rule.evaluated',
  'jev.requested',
  'jev.completed',
  'tool.started',
  'tool.completed',
  'information.requested',
  'information.received',
  'run.started',
  'run.interrupted',
  'run.resumed',
  'run.completed',
  'run.escalated',
  'result.invalidated',
  'change.applied',
  'order.status_changed',
  'operation.deduplicated',
] as const
export const EventName = z.enum(eventNames)
export type EventName = z.infer<typeof EventName>

export const Severity = z.enum(['debug', 'info', 'warn', 'error'])
export type Severity = z.infer<typeof Severity>

export const SpanLink = z.object({
  traceId: z.string().regex(/^[0-9a-f]{32}$/),
  spanId: z.string().regex(/^[0-9a-f]{16}$/),
  relation: z.string().min(1),
})
export type SpanLink = z.infer<typeof SpanLink>

const common = {
  eventId: z.string().min(1),
  // The event that caused this one, to explain business causality across traces.
  causationId: z.string().min(1).optional(),
  timestamp: z.iso.datetime(),
  severity: Severity,
  service: z.string().min(1),
  correlationId: z.string().min(1),
  caseId: z.string().min(1),
  caseRevision: z.int().positive().optional(),
  traceId: z
    .string()
    .regex(/^[0-9a-f]{32}$/)
    .optional(),
  spanId: z
    .string()
    .regex(/^[0-9a-f]{16}$/)
    .optional(),
  a2aTaskId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  attempt: z.int().positive().optional(),
  status: z.string().min(1).optional(),
  durationMs: z.number().nonnegative().optional(),
  errorCode: z.string().min(1).optional(),
  // Details by event name: ruleId, gateStatus, provider, modelId, operationId, toolName and so on.
  // Never full prompts, documents or secrets.
  attributes: z.record(z.string(), z.unknown()).optional(),
}

export const BusinessEvent = z.object({
  kind: z.literal('event'),
  eventName: EventName,
  ...common,
})
export type BusinessEvent = z.infer<typeof BusinessEvent>

export const SpanRecord = z.object({
  kind: z.literal('span'),
  // The span name, e.g. "branch.evaluate".
  eventName: z.string().min(1),
  ...common,
  traceId: z.string().regex(/^[0-9a-f]{32}$/),
  spanId: z.string().regex(/^[0-9a-f]{16}$/),
  parentSpanId: z
    .string()
    .regex(/^[0-9a-f]{16}$/)
    .optional(),
  startedAt: z.iso.datetime(),
  links: z.array(SpanLink).optional(),
})
export type SpanRecord = z.infer<typeof SpanRecord>

export const ObservabilityEvent = z.discriminatedUnion('kind', [BusinessEvent, SpanRecord])
export type ObservabilityEvent = z.infer<typeof ObservabilityEvent>

// What the collector hands back: the stored event and its position, which is the stream cursor.
export const StoredEvent = z.object({
  sequence: z.int().positive(),
  event: ObservabilityEvent,
})
export type StoredEvent = z.infer<typeof StoredEvent>
