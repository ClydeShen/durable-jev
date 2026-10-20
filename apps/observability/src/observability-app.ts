import type { StoredEvent } from '@durable-jev/contracts'
import { createServiceApp } from '@durable-jev/service-kit'
import type { ErrorRequestHandler, Express } from 'express'
import { z } from 'zod'
import { type CaseSummary, summarizeCase } from './case-summary.js'
import type { EventQuery, ObservationStore } from './observation-store.js'

const IngestBody = z.object({ events: z.array(z.unknown()).max(1000) })

const number = z.coerce.number().int().positive()
const QueryParams = z.object({
  correlationId: z.string().min(1).optional(),
  caseId: z.string().min(1).optional(),
  service: z.string().min(1).optional(),
  kind: z.enum(['event', 'span']).optional(),
  eventName: z.string().min(1).optional(),
  traceId: z.string().min(1).optional(),
  after: z.coerce.number().int().nonnegative().optional(),
  limit: number.max(5000).optional(),
})

const handleErrors: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: 'BAD_REQUEST', issues: error.issues })
    return
  }
  response.status(500).json({ error: 'INTERNAL', message: String(error) })
}

export function createObservabilityApp(store: ObservationStore): Express {
  const app = createServiceApp('observability')

  // Ingest is for the services' relays; everything else is read only.
  app.post('/events', (request, response) => {
    const { events } = IngestBody.parse(request.body)
    response.status(202).json(store.ingest(events))
  })

  app.get('/events', (request, response) => {
    const query = QueryParams.parse(request.query) as EventQuery
    response.json({ events: store.list(query), latest: store.latestSequence() })
  })

  // Server-sent events. Each message's id is the event's sequence, so a browser that reconnects
  // sends Last-Event-ID and receives exactly what it missed, in order. The live subscription is
  // opened before the backlog is read, so an event stored in between is neither lost nor sent twice.
  app.get('/stream', (request, response) => {
    const query = z
      .object({
        after: z.coerce.number().int().nonnegative().optional(),
        correlationId: z.string().min(1).optional(),
      })
      .parse(request.query)
    const lastEventId = Number(request.header('last-event-id'))
    let cursor = Number.isInteger(lastEventId) && lastEventId > 0 ? lastEventId : (query.after ?? 0)
    response.set({
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    response.flushHeaders()
    // Tell the browser how soon to try again after a drop.
    response.write('retry: 1000\n\n')

    const send = (stored: StoredEvent) => {
      if (stored.sequence <= cursor) return
      if (query.correlationId && stored.event.correlationId !== query.correlationId) return
      cursor = stored.sequence
      response.write(`id: ${stored.sequence}\ndata: ${JSON.stringify(stored)}\n\n`)
    }
    let replaying = true
    const waiting: StoredEvent[] = []
    const unsubscribe = store.subscribe((events) => {
      for (const stored of events) {
        if (replaying) waiting.push(stored)
        else send(stored)
      }
    })
    for (const stored of store.list({ after: cursor, limit: 100_000 })) send(stored)
    replaying = false
    for (const stored of waiting.sort((left, right) => left.sequence - right.sequence)) send(stored)

    // A real event, not a comment: a browser cannot see comments, and it needs something to tell
    // a quiet stream from a dead one.
    const heartbeat = setInterval(() => response.write('event: ping\ndata: {}\n\n'), 5_000)
    request.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
    })
  })

  app.get('/cases', (_request, response) => {
    const summaries: CaseSummary[] = []
    for (const correlationId of store.correlationIds()) {
      const summary = summarizeCase(
        store.list({ correlationId, limit: 5000 }).map((stored) => stored.event),
      )
      if (summary) summaries.push(summary)
    }
    response.json({ cases: summaries, latest: store.latestSequence() })
  })

  app.get('/cases/:correlationId', (request, response) => {
    const stored = store.list({ correlationId: request.params.correlationId, limit: 5000 })
    const summary = summarizeCase(stored.map((entry) => entry.event))
    if (!summary) {
      response.status(404).json({ error: 'NOT_FOUND' })
      return
    }
    response.json({ summary, events: stored, latest: store.latestSequence() })
  })

  app.use(handleErrors)
  return app
}
