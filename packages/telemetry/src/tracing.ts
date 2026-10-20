import {
  type Context,
  context,
  type Link,
  propagation,
  type Span,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api'
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { correlationIdFor, type Telemetry } from './telemetry.js'

const tracerName = 'durable-jev'
// Attributes that become fields of the stored span instead of free-form details.
const fieldAttributes = new Set(['caseId', 'caseRevision', 'a2aTaskId', 'runId', 'attempt'])

const toIso = (time: [number, number]) => new Date(time[0] * 1000 + time[1] / 1e6).toISOString()
const toMs = (time: [number, number]) => time[0] * 1000 + time[1] / 1e6

// Turns each finished span into a stored span record. A span that never learned which case it
// belongs to (a health check, say) is left out: the store is organised by case.
class SpanEventProcessor implements SpanProcessor {
  target: Telemetry | undefined

  onStart(): void {}

  onEnd(span: ReadableSpan): void {
    const caseId = span.attributes.caseId
    if (!this.target || typeof caseId !== 'string') return
    const { attributes } = span
    const details = Object.fromEntries(
      Object.entries(attributes).filter(([key]) => !fieldAttributes.has(key)),
    )
    const failed = span.status.code === SpanStatusCode.ERROR
    const context = span.spanContext()
    const links = span.links.map((link) => ({
      traceId: link.context.traceId,
      spanId: link.context.spanId,
      relation: String(link.attributes?.relation ?? 'link'),
    }))
    const caseRevision = attributes.caseRevision
    const attempt = attributes.attempt
    this.target.emitSpan({
      eventName: span.name,
      caseId,
      correlationId: correlationIdFor(caseId),
      timestamp: toIso(span.endTime),
      startedAt: toIso(span.startTime),
      durationMs: toMs(span.duration),
      traceId: context.traceId,
      spanId: context.spanId,
      ...(span.parentSpanContext ? { parentSpanId: span.parentSpanContext.spanId } : {}),
      ...(typeof caseRevision === 'number' ? { caseRevision } : {}),
      ...(typeof attributes.a2aTaskId === 'string' ? { a2aTaskId: attributes.a2aTaskId } : {}),
      ...(typeof attributes.runId === 'string' ? { runId: attributes.runId } : {}),
      ...(typeof attempt === 'number' ? { attempt } : {}),
      status: failed ? 'error' : 'ok',
      ...(failed ? { errorCode: String(attributes.errorCode ?? 'ERROR'), severity: 'error' } : {}),
      ...(links.length > 0 ? { links } : {}),
      ...(Object.keys(details).length > 0 ? { attributes: details } : {}),
    })
  }

  async forceFlush(): Promise<void> {}
  async shutdown(): Promise<void> {}
}

const processor = new SpanEventProcessor()
let registered = false

// Safe to call again (tests, restarts): the one tracer provider stays and only the place its
// spans are written to changes.
export function initTracing(telemetry: Telemetry): void {
  processor.target = telemetry
  if (registered) return
  new NodeTracerProvider({ spanProcessors: [processor] }).register()
  registered = true
}

export type SpanOptions = {
  caseId: string
  caseRevision?: number
  a2aTaskId?: string
  runId?: string
  attempt?: number
  attributes?: Record<string, string | number | boolean>
  links?: { traceparent: string; relation: string }[]
  // Start a new trace instead of continuing the current one.
  root?: boolean
}

const tracer = () => trace.getTracer(tracerName)

export function startSpan(name: string, options: SpanOptions): Span {
  const links = (options.links ?? []).flatMap((link): Link[] => {
    const linked = spanContextFromTraceparent(link.traceparent)
    return linked ? [{ context: linked, attributes: { relation: link.relation } }] : []
  })
  return tracer().startSpan(
    name,
    {
      root: options.root ?? false,
      links,
      attributes: {
        caseId: options.caseId,
        ...(options.caseRevision === undefined ? {} : { caseRevision: options.caseRevision }),
        ...(options.a2aTaskId ? { a2aTaskId: options.a2aTaskId } : {}),
        ...(options.runId ? { runId: options.runId } : {}),
        ...(options.attempt === undefined ? {} : { attempt: options.attempt }),
        ...options.attributes,
      },
    },
    context.active(),
  )
}

// Runs fn inside a new span; the span ends when fn settles and records a failure as an error.
export async function withSpan<T>(
  name: string,
  options: SpanOptions,
  fn: (span: Span) => Promise<T> | T,
): Promise<T> {
  const span = startSpan(name, options)
  try {
    return await context.with(trace.setSpan(context.active(), span), () => fn(span))
  } catch (error) {
    span.setAttribute('errorCode', error instanceof Error ? error.constructor.name : 'ERROR')
    span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) })
    throw error
  } finally {
    span.end()
  }
}

// Adds case details to the span that is already running, e.g. the HTTP span of a request whose
// body has just been read.
export function annotateActiveSpan(attributes: Record<string, string | number | boolean>): void {
  trace.getActiveSpan()?.setAttributes(attributes)
}

// W3C trace context of whatever is running now: what to store with a task or run so a later,
// separate trace can link back to it.
export function currentTraceparent(): string | undefined {
  const carrier: Record<string, string> = {}
  propagation.inject(context.active(), carrier)
  return carrier.traceparent
}

export function spanContextFromTraceparent(traceparent: string) {
  const match = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/.exec(traceparent)
  return match
    ? { traceId: match[1] as string, spanId: match[2] as string, traceFlags: 1, isRemote: true }
    : undefined
}

// fetch that carries the current trace to the service it calls.
export const fetchWithTrace: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers)
  const carrier: Record<string, string> = {}
  propagation.inject(context.active(), carrier)
  for (const [name, value] of Object.entries(carrier)) headers.set(name, value)
  return fetch(input, { ...init, headers })
}

// Server side: continue the caller's trace, or start one, for each request.
export function tracingMiddleware(): RequestHandler {
  return (request: Request, response: Response, next: NextFunction) => {
    const parent: Context = propagation.extract(context.active(), request.headers)
    const span = tracer().startSpan(
      `${request.method} ${request.baseUrl}${request.path}`,
      { kind: SpanKind.SERVER },
      parent,
    )
    response.on('finish', () => {
      span.setAttribute('httpStatus', response.statusCode)
      if (response.statusCode >= 500) {
        span.setAttribute('errorCode', `HTTP_${response.statusCode}`)
        span.setStatus({ code: SpanStatusCode.ERROR })
      }
      span.end()
    })
    context.with(trace.setSpan(parent, span), next)
  }
}
