import type {
  AgentSummary,
  CaseOrchestrator,
  CaseRuntime,
  CaseStore,
  CaseView,
  RulePack,
} from '@durable-jev/agent-core'
import { roleSchema } from '@durable-jev/contracts'
import type { HumanAction } from '@durable-jev/human-tasks'
import {
  applyRevision,
  type CaseCatalog,
  dispatchCase,
  orderStatusOf,
  rolesWaitedOn,
} from '@durable-jev/logistics'
import { actorOf, HttpError } from '@durable-jev/service-kit'
import { Router } from 'express'
import { z } from 'zod'

export interface CoordinatorDependencies {
  coordination: { runtime: CaseRuntime; store: CaseStore }
  orchestrator: CaseOrchestrator
  catalog: CaseCatalog
  rulePack: RulePack
  agentSummaries(): Promise<AgentSummary[]>
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

function scriptedRevisions(catalog: CaseCatalog, caseId: string) {
  return (catalog.get(caseId)?.events ?? []).flatMap((event) =>
    event.kind === 'revise' ? [{ label: event.label, patch: event.patch }] : [],
  )
}

export function coordinatorRoutes(dependencies: CoordinatorDependencies): Router {
  const { coordination, orchestrator, catalog, rulePack } = dependencies
  const router = Router()

  async function caseView(caseId: string): Promise<CaseView> {
    const record = coordination.store.caseRecord(caseId)
    if (!record) throw new HttpError(404, `case ${caseId} does not exist`)
    const { outcomes, tasks } = await orchestrator.state(caseId)
    return { record, outcomes, tasks }
  }

  router.get('/cases', async (_request, response) => {
    const views = await Promise.all(
      coordination.store.cases().map((record) => caseView(record.shipment.caseId)),
    )
    response.json(views.map((view) => summaryOf(view, catalog)))
  })

  router.get('/cases/:caseId', async (request, response) => {
    const view = await caseView(request.params.caseId)
    response.json({
      ...summaryOf(view, catalog),
      shipment: view.record.shipment,
      outcomes: view.outcomes,
      tasks: view.tasks,
      revisions: scriptedRevisions(catalog, view.record.shipment.caseId).map((revision, index) => ({
        index,
        label: revision.label,
        applied: view.record.shipment.caseRevision >= Number(revision.patch.caseRevision ?? 0),
      })),
    })
  })

  router.post('/cases/:caseId/revisions/:index', async (request, response) => {
    const { shipment } = (await caseView(request.params.caseId)).record
    const revision = scriptedRevisions(catalog, shipment.caseId)[Number(request.params.index)]
    if (!revision) throw new HttpError(404, `no scripted revision ${request.params.index}`)
    await orchestrator.submit(applyRevision(shipment, revision.patch))
    response.json(summaryOf(await caseView(shipment.caseId), catalog))
  })

  router.post('/cases/:caseId/dispatch', async (request, response) => {
    const { caseId } = request.params
    await caseView(caseId)
    const result = await dispatchCase(
      orchestrator,
      coordination.store,
      caseId,
      actorOf(request),
      dependencies.now,
    )
    if (!result.ok)
      throw new HttpError(result.reason === 'NOT_DISPATCHER' ? 403 : 409, result.message)
    response.json(summaryOf(await caseView(caseId), catalog))
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

  router.get('/agents', async (_request, response) => {
    response.json(await dependencies.agentSummaries())
  })

  router.get('/tasks', async (request, response) => {
    const role = request.query.role === undefined ? undefined : roleSchema.parse(request.query.role)
    const tasks = await orchestrator.openTasks()
    response.json(tasks.filter((task) => role === undefined || task.requiredRole === role))
  })

  router.post('/tasks/:taskId/decision', async (request, response) => {
    const body = decisionSchema.parse(request.body)
    const action: HumanAction = { ...body, actor: actorOf(request) }
    const decision = await orchestrator.decide(request.params.taskId, action)
    if (!decision.ok) {
      response.status(decision.reason === 'NOT_FOUND' ? 404 : 422).json(decision)
      return
    }
    response.json(decision)
  })

  router.post('/demo/reset', async (_request, response) => {
    await dependencies.resetDemo()
    response.json({ cases: coordination.store.cases().length })
  })

  return router
}
