import {
  CaseNotFoundError,
  type CaseRuntime,
  type CaseStore,
  type CaseView,
  type RulePack,
} from '@durable-jev/agent-core'
import { roleSchema } from '@durable-jev/contracts'
import type { HumanAction } from '@durable-jev/human-tasks'
import { actorOf, HttpError } from '@durable-jev/service-kit'
import { Router } from 'express'
import { z } from 'zod'
import type { CaseCatalog } from './case-catalog.js'
import { dispatchCase } from './dispatch.js'
import { orderStatusOf, rolesWaitedOn } from './order-status.js'

export interface CoordinatorDependencies {
  runtime: CaseRuntime
  store: CaseStore
  catalog: CaseCatalog
  rulePack: RulePack
  now(): string
  resetDemo(): Promise<void>
}

const decisionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.enum(['approve', 'reject']), comment: z.string().optional() }),
  z.object({
    type: z.literal('complete'),
    fields: z.record(z.string(), z.unknown()),
    evidenceRefs: z.array(z.string()).default([]),
  }),
])

function summaryOf(view: CaseView, catalog: CaseCatalog) {
  const { shipment } = view.record
  return {
    caseId: shipment.caseId,
    story: catalog.get(shipment.caseId)?.story ?? '',
    status: orderStatusOf(view),
    caseRevision: shipment.caseRevision,
    waitingOn: rolesWaitedOn(view),
    updatedAt: view.record.updatedAt,
  }
}

function viewOf(runtime: CaseRuntime, caseId: string): CaseView {
  try {
    return runtime.view(caseId)
  } catch (error) {
    if (error instanceof CaseNotFoundError) throw new HttpError(404, error.message)
    throw error
  }
}

export function coordinatorRoutes(dependencies: CoordinatorDependencies): Router {
  const { runtime, store, catalog, rulePack } = dependencies
  const router = Router()

  router.get('/cases', (_request, response) => {
    response.json(
      store.cases().map((record) => summaryOf(runtime.view(record.shipment.caseId), catalog)),
    )
  })

  router.get('/cases/:caseId', (request, response) => {
    const view = viewOf(runtime, request.params.caseId)
    response.json({
      ...summaryOf(view, catalog),
      shipment: view.record.shipment,
      outcomes: view.outcomes,
      tasks: view.tasks,
    })
  })

  router.post('/cases/:caseId/dispatch', async (request, response) => {
    viewOf(runtime, request.params.caseId)
    const view = await dispatchCase(
      runtime,
      store,
      request.params.caseId,
      actorOf(request),
      dependencies.now,
    )
    response.json(summaryOf(view, catalog))
  })

  router.get('/rules', (_request, response) => {
    response.json({
      ruleSetVersion: rulePack.ruleSet.ruleSetVersion,
      rules: rulePack.ruleSet.rules.map(
        ({ ruleId, title, owner, scope, dependsOn, evaluator }) => ({
          ruleId,
          title,
          owner,
          scope,
          dependsOn,
          kind: evaluator.kind,
        }),
      ),
    })
  })

  router.get('/tasks', (request, response) => {
    const role = request.query.role === undefined ? undefined : roleSchema.parse(request.query.role)
    response.json(
      store.openTasks().filter((task) => role === undefined || task.requiredRole === role),
    )
  })

  router.post('/tasks/:taskId/decision', async (request, response) => {
    const body = decisionSchema.parse(request.body)
    const action: HumanAction = { ...body, actor: actorOf(request) }
    const decision = await runtime.decide(request.params.taskId, action)
    if (!decision.ok) {
      response.status(decision.reason === 'NOT_FOUND' ? 404 : 422).json(decision)
      return
    }
    response.json(decision)
  })

  router.post('/demo/reset', async (_request, response) => {
    await dependencies.resetDemo()
    response.json({ cases: store.cases().length })
  })

  return router
}
