import { randomUUID } from 'node:crypto'
import {
  type BusinessEvent,
  ObservabilityEvent,
  type Severity,
  type SpanRecord,
} from '@durable-jev/contracts'
import { appendOutboxEvent, type StoreDatabase } from '@durable-jev/store'
import { trace } from '@opentelemetry/api'
import { OutboxRelay } from './outbox-relay.js'
import { redact } from './redact.js'

export type EmitInput = {
  eventName: BusinessEvent['eventName']
  caseId: string
  // Defaults to corr-<caseId>: one correlation id per case, kept across retries and restarts.
  correlationId?: string
  severity?: Severity
  eventId?: string
  causationId?: string
  caseRevision?: number
  a2aTaskId?: string
  runId?: string
  attempt?: number
  status?: string
  durationMs?: number
  errorCode?: string
  attributes?: Record<string, unknown>
}

export type SpanInput = Omit<
  SpanRecord,
  'kind' | 'eventId' | 'timestamp' | 'service' | 'severity'
> & {
  severity?: Severity
  eventId?: string
  timestamp: string
}

export const correlationIdFor = (caseId: string) => `corr-${caseId}`

// Writes events to this service's own outbox, in the same SQLite file as its business data. The
// relay carries them to the collector later, so nothing here waits on or depends on that.
export class Telemetry {
  constructor(
    readonly service: string,
    private readonly database: StoreDatabase,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  emit(input: EmitInput): ObservabilityEvent {
    const { traceId, spanId } = activeTraceIds()
    const { attributes, ...rest } = input
    return this.record({
      ...rest,
      kind: 'event',
      eventId: input.eventId ?? randomUUID(),
      timestamp: this.now(),
      severity: input.severity ?? (input.errorCode ? 'error' : 'info'),
      service: this.service,
      correlationId: input.correlationId ?? correlationIdFor(input.caseId),
      ...(traceId ? { traceId } : {}),
      ...(spanId ? { spanId } : {}),
      ...(attributes ? { attributes: redact(attributes) as Record<string, unknown> } : {}),
    })
  }

  emitSpan(input: SpanInput): ObservabilityEvent {
    const { attributes, ...rest } = input
    return this.record({
      ...rest,
      kind: 'span',
      eventId: input.eventId ?? randomUUID(),
      severity: input.severity ?? (input.errorCode ? 'error' : 'info'),
      service: this.service,
      ...(attributes ? { attributes: redact(attributes) as Record<string, unknown> } : {}),
    })
  }

  private record(candidate: unknown): ObservabilityEvent {
    const event = ObservabilityEvent.parse(candidate)
    appendOutboxEvent(this.database, {
      eventId: event.eventId,
      eventType: event.eventName,
      correlationId: event.correlationId,
      payload: event,
    })
    return event
  }
}

function activeTraceIds(): { traceId?: string; spanId?: string } {
  const context = trace.getActiveSpan()?.spanContext()
  return context && trace.isSpanContextValid(context)
    ? { traceId: context.traceId, spanId: context.spanId }
    : {}
}

export type ServiceTelemetry = { telemetry: Telemetry; relay?: OutboxRelay; stop(): void }

// One call per service at startup. Without a collector URL events still land in the outbox and
// wait there, so a service started before the collector loses nothing.
export function startServiceTelemetry(options: {
  service: string
  database: StoreDatabase
  collectorUrl?: string | undefined
}): ServiceTelemetry {
  const telemetry = new Telemetry(options.service, options.database)
  if (!options.collectorUrl) return { telemetry, stop: () => {} }
  const relay = new OutboxRelay({ database: options.database, collectorUrl: options.collectorUrl })
  relay.start()
  return { telemetry, relay, stop: () => relay.stop() }
}
