import {
  BranchEvaluationRequest,
  type BranchEvaluationResult,
  type ReferenceData,
  type RuleBranch,
} from '@durable-jev/contracts'
import { evaluateBranch, type RuleConfiguration } from '@durable-jev/rule-evaluation'
import { createServiceApp } from '@durable-jev/service-kit'
import type { Migration, StoreDatabase } from '@durable-jev/store'
import type { ErrorRequestHandler, Express } from 'express'
import { z } from 'zod'

export const branchServiceMigrations: readonly Migration[] = [
  {
    id: 'branch-001-evaluation-log',
    sql: `CREATE TABLE evaluation_log (
      evaluation_id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id TEXT NOT NULL,
      case_revision INTEGER NOT NULL,
      evaluated_at TEXT NOT NULL,
      result_json TEXT NOT NULL
    )`,
  },
]

export type BranchServiceDependencies = {
  serviceName: string
  branches: readonly RuleBranch[]
  configuration: RuleConfiguration
  referenceData: ReferenceData
  database: StoreDatabase
  ensurePlanReservation?: (request: BranchEvaluationRequest) => boolean
  now?: () => string
}

const handleErrors: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: 'BAD_REQUEST', issues: error.issues })
    return
  }
  response.status(500).json({ error: 'INTERNAL', message: String(error) })
}

export function createBranchServiceApp(dependencies: BranchServiceDependencies): Express {
  const now = dependencies.now ?? (() => new Date().toISOString())
  const recordEvaluation = dependencies.database.prepare(
    `INSERT INTO evaluation_log (case_id, case_revision, evaluated_at, result_json) VALUES (?, ?, ?, ?)`,
  )
  const app = createServiceApp(dependencies.serviceName)

  app.get('/capabilities', (_request, response) => {
    response.json({ service: dependencies.serviceName, branches: dependencies.branches })
  })

  app.post('/evaluations', (request, response) => {
    const evaluationRequest = BranchEvaluationRequest.parse(request.body)
    const result: BranchEvaluationResult = dependencies.database
      .transaction(() => {
        const evaluated = evaluateBranch(evaluationRequest, dependencies)
        recordEvaluation.run(
          evaluationRequest.caseId,
          evaluationRequest.caseRevision,
          now(),
          JSON.stringify(evaluated),
        )
        return evaluated
      })
      .immediate()
    response.json(result)
  })

  app.use(handleErrors)
  return app
}
