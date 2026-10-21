import type { RerouteDesk } from '@durable-jev/logistics'
import { actorOf, HttpError } from '@durable-jev/service-kit'
import { Router } from 'express'
import { z } from 'zod'

const reportSchema = z.object({
  caseId: z.string().min(1),
  incident: z.object({ type: z.literal('carrierCancelled'), legId: z.string().min(1) }),
})

const decisionSchema = z.object({ type: z.enum(['confirm', 'reject']) })

export function investigationRoutes(desk: RerouteDesk): Router {
  const router = Router()
  router.post('/', async (request, response) => {
    const { caseId, incident } = reportSchema.parse(request.body)
    response.status(202).json(await desk.report(caseId, incident))
  })
  router.get('/', (request, response) => {
    response.json(desk.ofCase(z.string().min(1).parse(request.query.caseId)))
  })
  router.post('/:investigationId/decision', (request, response) => {
    const { type } = decisionSchema.parse(request.body)
    const result = desk.decide(request.params.investigationId, { type, actor: actorOf(request) })
    if (!result.ok) throw new HttpError(result.reason === 'NOT_FOUND' ? 404 : 409, result.message)
    response.json(result)
  })
  return router
}
