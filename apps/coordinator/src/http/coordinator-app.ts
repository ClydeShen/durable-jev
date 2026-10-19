import { Role, Shipment } from '@durable-jev/contracts'
import { createServiceApp } from '@durable-jev/service-kit'
import type { ErrorRequestHandler, Express, Request } from 'express'
import { z } from 'zod'
import { CoordinatorError, type CoordinatorErrorCode } from '../coordinator-errors.js'
import type { CoordinatorService } from '../coordinator-service.js'

const SubmitCaseBody = z.object({
  shipment: Shipment,
  scriptedSemanticAnswers: z
    .array(
      z.object({
        ruleId: z.string(),
        entityId: z.string(),
        answer: z.discriminatedUnion('type', [
          z.object({ type: z.literal('noul'), noul: z.number() }),
          z.object({
            type: z.literal('choice'),
            choice: z.string(),
            probabilities: z.record(z.string(), z.number()),
          }),
        ]),
      }),
    )
    .optional(),
})
const ApproveBody = z.object({ reason: z.string().optional() })
const RejectBody = z.object({ reason: z.string().min(1) })
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
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: 'BAD_REQUEST', issues: error.issues })
    return
  }
  response.status(500).json({ error: 'INTERNAL', message: String(error) })
}

export function createCoordinatorApp(coordinator: CoordinatorService): Express {
  const app = createServiceApp('coordinator')

  app.get('/rules', (_request, response) => {
    response.json(coordinator.listRules())
  })

  app.get('/cases', (_request, response) => {
    response.json(coordinator.listCases())
  })

  app.post('/cases', (request, response) => {
    const body = SubmitCaseBody.parse(request.body)
    response.status(201).json(coordinator.submitCase(body))
  })

  app.get('/cases/:caseId', (request, response) => {
    response.json(coordinator.getCase(request.params.caseId))
  })

  app.post('/cases/:caseId/dispatch', (request, response) => {
    response.json(coordinator.dispatch(request.params.caseId, demoRoleOf(request)))
  })

  app.get('/human-tasks', (request, response) => {
    const role = Role.optional().parse(request.query.role)
    response.json(coordinator.listOpenHumanTasks(role))
  })

  app.post('/human-tasks/:humanTaskId/approve', (request, response) => {
    const { reason } = ApproveBody.parse(request.body ?? {})
    response.json(
      coordinator.approveHumanTask(request.params.humanTaskId, demoRoleOf(request), reason),
    )
  })

  app.post('/human-tasks/:humanTaskId/reject', (request, response) => {
    const { reason } = RejectBody.parse(request.body)
    response.json(
      coordinator.rejectHumanTask(request.params.humanTaskId, demoRoleOf(request), reason),
    )
  })

  app.post('/human-tasks/:humanTaskId/complete', (request, response) => {
    const { fields, evidenceRefs } = CompleteBody.parse(request.body)
    response.json(
      coordinator.completeHumanTask(
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
