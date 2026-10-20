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
