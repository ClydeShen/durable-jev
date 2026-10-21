import { BranchUnavailableError } from '@durable-jev/branch-service'
import {
  CaseEvidence,
  PlanChange,
  type ReferenceData,
  Role,
  ScriptedSemanticAnswer,
  Shipment,
} from '@durable-jev/contracts'
import { createServiceApp } from '@durable-jev/service-kit'
import { annotateActiveSpan, tracingMiddleware } from '@durable-jev/telemetry'
import type { ErrorRequestHandler, Express, Request } from 'express'
import { z } from 'zod'
import { CoordinatorError, type CoordinatorErrorCode } from '../coordinator.errors.js'
import type { CoordinatorService } from '../coordinator.service.js'

const SubmitCaseBody = z.object({
  shipment: Shipment,
  evidence: CaseEvidence.optional(),
  scriptedSemanticAnswers: z.array(ScriptedSemanticAnswer).optional(),
})
const ApproveBody = z.object({
  reason: z.string().optional(),
  conditions: z.array(z.enum(['REWORK_REQUIRED'])).optional(),
})
const RejectBody = z.object({ reason: z.string().min(1) })
const InvestigateBody = z.object({
  legId: z.string().min(1),
  unavailableCarrierIds: z.array(z.string().min(1)).min(1),
  reason: z.string().min(1),
})
const CompleteBody = z.object({
  fields: z.record(z.string(), z.string()),
  evidenceRefs: z.array(z.string()).default([]),
})

const httpStatusByCode: Record<CoordinatorErrorCode, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  NOT_READY_TO_DISPATCH: 409,
}

function demoRoleOf(request: Request): Role {
  const parsed = Role.safeParse(request.header('x-demo-role'))
  if (!parsed.success)
    throw new CoordinatorError('FORBIDDEN', 'x-demo-role header is missing or unknown')
  return parsed.data
}

const handleErrors: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof CoordinatorError) {
    response.status(httpStatusByCode[error.code]).json({
      error: error.code,
      message: error.message,
      details: error.details,
    })
    return
  }
  if (error instanceof BranchUnavailableError) {
    response.status(503).json({ error: 'BRANCH_UNAVAILABLE', message: error.message })
    return
  }
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: 'BAD_REQUEST', issues: error.issues })
    return
  }
  response.status(500).json({ error: 'INTERNAL', message: String(error) })
}

export function createCoordinatorApp(
  coordinator: CoordinatorService,
  referenceData?: ReferenceData,
): Express {
  const app = createServiceApp('coordinator')
  // One trace per request; everything the coordinator does for it hangs off this span.
  app.use(tracingMiddleware())
  // Only requests that change something are recorded: the workbench polls with GET every couple
  // of seconds, and reads would drown the real work.
  app.param('caseId', (request, _response, next, caseId: string) => {
    if (request.method !== 'GET') annotateActiveSpan({ caseId })
    next()
  })

  app.get('/reference-data', (_request, response) => {
    response.json(referenceData ?? { carriers: [], vehicles: [], hubs: [], customers: [] })
  })

  app.get('/rules', (_request, response) => {
    response.json(coordinator.listRules())
  })

  app.get('/cases', (_request, response) => {
    response.json(coordinator.listCases())
  })

  app.post('/cases', async (request, response) => {
    const body = SubmitCaseBody.parse(request.body)
    response.status(201).json(await coordinator.submitCase(body))
  })

  app.get('/cases/:caseId', (request, response) => {
    response.json(coordinator.getCase(request.params.caseId))
  })

  app.post('/cases/:caseId/changes', async (request, response) => {
    const change = PlanChange.parse(request.body)
    // If-Match: the revision the client based the change on, e.g. "2" or "r2".
    const ifMatch = request.header('if-match')?.replace(/^"?r?|"$/g, '')
    const expectedRevision = ifMatch ? z.coerce.number().int().positive().parse(ifMatch) : undefined
    response.json(
      await coordinator.applyChange(
        request.params.caseId,
        change,
        demoRoleOf(request),
        expectedRevision,
      ),
    )
  })

  app.post('/cases/:caseId/investigations', async (request, response) => {
    const body = InvestigateBody.parse(request.body)
    response
      .status(201)
      .json(await coordinator.investigateCarrier(request.params.caseId, body, demoRoleOf(request)))
  })

  app.post('/investigations/:investigationId/accept', async (request, response) => {
    response.json(
      await coordinator.acceptInvestigation(request.params.investigationId, demoRoleOf(request)),
    )
  })

  app.post('/investigations/:investigationId/reject', (request, response) => {
    const { reason } = RejectBody.parse(request.body)
    response.json(
      coordinator.rejectInvestigation(request.params.investigationId, demoRoleOf(request), reason),
    )
  })

  app.post('/cases/:caseId/reevaluate', async (request, response) => {
    response.json(await coordinator.reevaluate(request.params.caseId))
  })

  app.post('/cases/:caseId/dispatch', async (request, response) => {
    response.json(await coordinator.dispatch(request.params.caseId, demoRoleOf(request)))
  })

  app.get('/human-tasks', (request, response) => {
    const role = Role.optional().parse(request.query.role)
    response.json(coordinator.listOpenHumanTasks(role))
  })

  app.post('/human-tasks/:humanTaskId/approve', async (request, response) => {
    const { reason, conditions } = ApproveBody.parse(request.body ?? {})
    response.json(
      await coordinator.approveHumanTask(
        request.params.humanTaskId,
        demoRoleOf(request),
        reason,
        conditions,
      ),
    )
  })

  app.post('/human-tasks/:humanTaskId/reject', async (request, response) => {
    const { reason } = RejectBody.parse(request.body)
    response.json(
      await coordinator.rejectHumanTask(request.params.humanTaskId, demoRoleOf(request), reason),
    )
  })

  app.post('/human-tasks/:humanTaskId/complete', async (request, response) => {
    const { fields, evidenceRefs } = CompleteBody.parse(request.body)
    response.json(
      await coordinator.completeHumanTask(
        request.params.humanTaskId,
        demoRoleOf(request),
        fields,
        evidenceRefs as never,
      ),
    )
  })

  app.use(handleErrors)
  return app
}
