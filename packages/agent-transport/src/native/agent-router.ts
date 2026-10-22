import type { AgentClient, AgentSummary } from '@durable-jev/agent-core'
import { roleSchema, shipmentSchema } from '@durable-jev/contracts'
import type { RuleOutcome } from '@durable-jev/rule-engine'
import { Router } from 'express'
import { z } from 'zod'

const actionSchema = z
  .object({
    type: z.enum(['approve', 'reject', 'complete', 'expire', 'cancel', 'supersede']),
    actor: z.object({ id: z.string().min(1), role: roleSchema }).optional(),
  })
  .passthrough()

export function agentRouter(client: AgentClient, summary: () => AgentSummary): Router {
  const router = Router()
  router.get('/summary', (_request, response) => {
    response.json(summary())
  })
  router.put('/cases/:caseId', async (request, response) => {
    response.json(await client.submit(shipmentSchema.parse(request.body)))
  })
  router.post('/cases/:caseId/evaluate', async (request, response) => {
    const foreign = z.array(z.unknown()).parse(request.body.foreign) as RuleOutcome[]
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
    response.json(
      await client.decide(request.params.taskId, action as Parameters<AgentClient['decide']>[1]),
    )
  })
  router.get('/events', async (_request, response) => {
    response.json(await client.events())
  })
  router.post('/events/ack', async (request, response) => {
    await client.acknowledgeEvents(z.array(z.string()).parse(request.body.eventIds))
    response.json({ acknowledged: true })
  })
  router.post('/reset', async (_request, response) => {
    await client.reset()
    response.json({ reset: true })
  })
  return router
}
