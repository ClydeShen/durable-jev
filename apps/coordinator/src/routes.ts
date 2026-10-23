import type {
  AgentSummary,
  CaseOrchestrator,
  CaseRuntime,
  CaseStore,
  CaseView,
  RulePack,
} from '@durable-jev/agent-core'
import { type OrderOptions, roleSchema, shipmentSchema } from '@durable-jev/contracts'
import type { HumanAction } from '@durable-jev/human-tasks'
import {
  applyRevision,
  type CaseCatalog,
  caseFileOf,
  dispatchCase,
  newOrderId,
  orderStatusOf,
  rolesWaitedOn,
} from '@durable-jev/logistics'
import { actorOf, HttpError } from '@durable-jev/service-kit'
import { Router } from 'express'
import { z } from 'zod'
import type { TimelineEntry } from './event-log.js'
import type { InvestigationClient } from './investigation-client.js'

export type AgentStatus = {
  agentId: string
  available: boolean
  summary?: AgentSummary
  card?: { name: string; description: string; url: string }
  /** What the agent does, for its card in the console. */
  responsibilities: string[]
  transport: 'native' | 'a2a'
  a2aTasks: number
}

export interface CoordinatorDependencies {
  coordination: { runtime: CaseRuntime; store: CaseStore }
  orchestrator: CaseOrchestrator
  catalog: CaseCatalog
  orderOptions: OrderOptions
  rulePack: RulePack
  investigations: InvestigationClient
  agentStatuses(): Promise<AgentStatus[]>
  controlUrl?: string
  timeline(caseId: string): TimelineEntry[]
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

function storyOf(catalog: CaseCatalog, caseId: string): string {
  const caseFile = caseFileOf(catalog, caseId)
  if (!caseFile) return ''
  const sampleId = caseFile.shipment.caseId
  return sampleId === caseId ? caseFile.story : `按样例 ${sampleId} 新下的订单。${caseFile.story}`
}

function summaryOf(view: CaseView, catalog: CaseCatalog) {
  const { shipment } = view.record
  return {
    caseId: shipment.caseId,
    story: storyOf(catalog, shipment.caseId),
    status: orderStatusOf(view),
    caseRevision: shipment.caseRevision,
    waitingOn: rolesWaitedOn(view),
    updatedAt: view.record.updatedAt,
  }
}

function scriptedRevisions(catalog: CaseCatalog, caseId: string) {
  return (caseFileOf(catalog, caseId)?.events ?? []).flatMap((event) =>
    event.kind === 'revise' ? [{ label: event.label, patch: event.patch }] : [],
  )
}

function scriptedIncidents(catalog: CaseCatalog, caseId: string) {
  return (caseFileOf(catalog, caseId)?.events ?? []).flatMap((event) =>
    event.kind === 'incident' ? [{ label: event.label, incident: event.incident }] : [],
  )
}

const actorHeaderNames = ['x-demo-role', 'x-demo-user']

function caseViews({ coordination, orchestrator }: CoordinatorDependencies) {
  return async (caseId: string): Promise<CaseView> => {
    const record = coordination.store.caseRecord(caseId)
    if (!record) throw new HttpError(404, `case ${caseId} does not exist`)
    const { outcomes, tasks } = await orchestrator.state(caseId)
    return { record, outcomes, tasks }
  }
}

type CaseViewOf = ReturnType<typeof caseViews>

function caseRoutes(router: Router, dependencies: CoordinatorDependencies, caseView: CaseViewOf) {
  const { coordination, orchestrator, catalog, investigations } = dependencies

  router.get('/cases', async (_request, response) => {
    const views = await Promise.all(
      coordination.store.cases().map((record) => caseView(record.shipment.caseId)),
    )
    response.json(views.map((view) => summaryOf(view, catalog)))
  })

  router.get('/cases/:caseId', async (request, response) => {
    const view = await caseView(request.params.caseId)
    const { shipment } = view.record
    response.json({
      ...summaryOf(view, catalog),
      shipment,
      outcomes: view.outcomes,
      tasks: view.tasks,
      revisions: scriptedRevisions(catalog, shipment.caseId).map((revision, index) => ({
        index,
        label: revision.label,
        applied: shipment.caseRevision >= Number(revision.patch.caseRevision ?? 0),
      })),
      incidents: scriptedIncidents(catalog, shipment.caseId).map((incident, index) => ({
        index,
        label: incident.label,
      })),
      investigations: await investigations.ofCase(shipment.caseId).catch(() => []),
    })
  })

  router.get('/cases/:caseId/timeline', async (request, response) => {
    await caseView(request.params.caseId)
    response.json(dependencies.timeline(request.params.caseId))
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
}

const newOrderSchema = z.object({ sampleId: z.string().min(1), shipment: shipmentSchema })

/**
 * The order entry point: the form starts from a sample order, and a submitted order becomes a new
 * case that every agent evaluates from the start.
 */
function orderRoutes(router: Router, dependencies: CoordinatorDependencies, caseView: CaseViewOf) {
  const { coordination, orchestrator, catalog, orderOptions } = dependencies

  router.get('/order-form', (_request, response) => {
    response.json({
      samples: [...catalog.values()].map((caseFile) => ({
        sampleId: caseFile.shipment.caseId,
        story: caseFile.story,
        shipment: caseFile.shipment,
      })),
      options: orderOptions,
    })
  })

  router.post('/orders', async (request, response) => {
    const { sampleId, shipment } = newOrderSchema.parse(request.body)
    if (!catalog.has(sampleId)) throw new HttpError(404, `no sample order ${sampleId}`)
    const caseId = newOrderId(
      sampleId,
      coordination.store.cases().map((record) => record.shipment.caseId),
    )
    await orchestrator.submit({
      ...shipment,
      caseId,
      correlationId: `corr-${caseId}`,
      shipmentId: `SHP-${caseId}`,
    })
    response.status(201).json(summaryOf(await caseView(caseId), catalog))
  })
}

function investigationRoutes(
  router: Router,
  dependencies: CoordinatorDependencies,
  caseView: CaseViewOf,
) {
  const { orchestrator, catalog, investigations } = dependencies

  router.post('/cases/:caseId/incidents/:index', async (request, response) => {
    const { caseId } = (await caseView(request.params.caseId)).record.shipment
    const scripted = scriptedIncidents(catalog, caseId)[Number(request.params.index)]
    if (!scripted) throw new HttpError(404, `no scripted incident ${request.params.index}`)
    response.status(202).json(await investigations.report(caseId, scripted.incident))
  })

  router.post('/investigations/:investigationId/decision', async (request, response) => {
    const { type } = z.object({ type: z.enum(['confirm', 'reject']) }).parse(request.body)
    const headers = Object.fromEntries(
      actorHeaderNames.flatMap((name) => {
        const value = request.header(name)
        return value ? [[name, value]] : []
      }),
    )
    const result = await investigations.decide(request.params.investigationId, type, headers)
    const { shipment } = (await caseView(result.investigation.caseId)).record
    if (result.patch) await orchestrator.submit(applyRevision(shipment, result.patch))
    response.json(summaryOf(await caseView(shipment.caseId), catalog))
  })
}

function taskRoutes(router: Router, { orchestrator }: CoordinatorDependencies) {
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
}

function ruleAndAgentRoutes(router: Router, { rulePack, agentStatuses }: CoordinatorDependencies) {
  router.get('/rules', (_request, response) => {
    response.json({
      ruleSetVersion: rulePack.ruleSet.ruleSetVersion,
      rules: rulePack.ruleSet.rules.map((rule) => ({
        ruleId: rule.ruleId,
        title: rule.title,
        owner: rule.owner,
        scope: rule.scope,
        dependsOn: rule.dependsOn,
        kind: rule.evaluator.kind,
        extension: rule.applicability !== undefined,
        clause: rulePack.clauses.get(rule.ruleId),
        definition: {
          appliesWhen: rule.appliesWhen,
          applicability: rule.applicability,
          expression: rule.expression,
          semantic: rule.semantic && {
            question: rule.semantic.question,
            passWhen: rule.semantic.passWhen,
          },
          humanGate: rule.humanGate,
          combiner: rule.combiner,
          mixing: rule.mixing,
          unknownPolicy: rule.unknownPolicy,
          invalidationTriggers: rule.invalidationTriggers,
        },
        parameters: Object.fromEntries(
          rule.parameters.map((name) => [name, rulePack.parameters[name]]),
        ),
      })),
    })
  })

  router.get('/agents', async (_request, response) => {
    response.json(await agentStatuses())
  })
}

function demoRoutes(router: Router, dependencies: CoordinatorDependencies) {
  const control = () => {
    if (!dependencies.controlUrl) throw new HttpError(404, 'demo control is not available')
    return dependencies.controlUrl
  }

  router.get('/demo/services', async (_request, response) => {
    response.json(await (await fetch(`${control()}/services`)).json())
  })

  router.post('/demo/services/:name/:verb', async (request, response) => {
    const { name, verb } = request.params
    if (verb !== 'crash' && verb !== 'start')
      throw new HttpError(400, 'verb must be crash or start')
    const result = await fetch(`${control()}/services/${name}/${verb}`, { method: 'POST' })
    response.status(result.status).json(await result.json())
  })

  router.post('/demo/reset', async (_request, response) => {
    await dependencies.resetDemo()
    response.json({ cases: dependencies.coordination.store.cases().length })
  })
}

export function coordinatorRoutes(dependencies: CoordinatorDependencies): Router {
  const router = Router()
  const caseView = caseViews(dependencies)
  caseRoutes(router, dependencies, caseView)
  orderRoutes(router, dependencies, caseView)
  investigationRoutes(router, dependencies, caseView)
  taskRoutes(router, dependencies)
  ruleAndAgentRoutes(router, dependencies)
  demoRoutes(router, dependencies)
  return router
}
