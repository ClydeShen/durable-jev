import type { AgentClient, AgentSummary } from '@durable-jev/agent-core'
import { businessCaseSchema } from '@durable-jev/contracts'
import { ruleOutcomeSchema } from '@durable-jev/rule-engine'
import { Router } from 'express'
import { z } from 'zod'
import { forgetRequests } from '../request-cache.js'
import { actionSchema } from '../request-schemas.js'

export function agentRouter(client: AgentClient, summary: () => AgentSummary): Router {
  const router = Router()
  router.get('/summary', (_request, response) => {
    response.json(summary())
  })
  router.put('/cases/:caseId', async (request, response) => {
    response.json(await client.submit(businessCaseSchema.parse(request.body)))
  })
  router.post('/cases/:caseId/evaluate', async (request, response) => {
    const foreign = z.array(ruleOutcomeSchema).parse(request.body.foreign)
    response.json(await client.evaluate(request.params.caseId, foreign))
  })
  router.get('/cases/:caseId', async (request, response) => {
    response.json(await client.state(request.params.caseId))
  })
  router.get('/tasks', async (_request, response) => {
    response.json(await client.openTasks())
  })
  router.post('/tasks/:taskId/decision', async (request, response) => {
    const action = actionSchema.parse(request.body)
    response.json(await client.decide(request.params.taskId, action))
  })
  router.get('/events', async (_request, response) => {
    response.json(await client.events())
  })
  router.post('/events/ack', async (request, response) => {
    await client.acknowledgeEvents(z.array(z.string()).parse(request.body.eventIds))
    response.json({ acknowledged: true })
  })
  router.post('/reset', async (request, response) => {
    const { caseId } = z.object({ caseId: z.string().min(1).optional() }).parse(request.body ?? {})
    await client.reset(caseId)
    forgetRequests(client, caseId)
    response.json({ reset: caseId ?? 'all' })
  })
  return router
}
