import {
  a2aServerMigrations,
  branchAgentCard,
  evaluationExecutor,
  mountA2a,
} from '@durable-jev/a2a-adapter'
import {
  BranchEvaluationRequest,
  type BranchEvaluationResult,
  type ReferenceData,
  type RuleBranch,
} from '@durable-jev/contracts'
import {
  evaluateBranchWithJudge,
  type JudgeFor,
  JudgeUnavailableError,
  type RuleConfiguration,
} from '@durable-jev/rule-evaluation'
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
  ...a2aServerMigrations,
]

export type BranchServiceDependencies = {
  serviceName: string
  branches: readonly RuleBranch[]
  configuration: RuleConfiguration
  referenceData: ReferenceData
  database: StoreDatabase
  ensurePlanReservation?: (request: BranchEvaluationRequest) => boolean
  judgeFor?: JudgeFor
  // Where clients reach this service; the A2A Agent Card advertises it.
  publicUrl: () => string
  // Demo only: exposes POST /faults/delay so a slow service can be shown in the workbench.
  demoFaults?: boolean
  now?: () => string
}

const handleErrors: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: 'BAD_REQUEST', issues: error.issues })
    return
  }
  if (error instanceof JudgeUnavailableError) {
    response.status(503).json({ error: 'JUDGE_UNAVAILABLE', message: error.message })
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

  let injectedDelayMs = 0
  if (dependencies.demoFaults) {
    app.post('/faults/delay', (request, response) => {
      injectedDelayMs = z.object({ ms: z.int().min(0).max(60_000) }).parse(request.body).ms
      response.json({ service: dependencies.serviceName, delayMs: injectedDelayMs })
    })
  }

  // Native HTTP and A2A run the same evaluation and log it the same way.
  const evaluate = async (evaluationRequest: BranchEvaluationRequest) => {
    if (injectedDelayMs > 0) await new Promise((wait) => setTimeout(wait, injectedDelayMs))
    const result: BranchEvaluationResult = await evaluateBranchWithJudge(
      evaluationRequest,
      dependencies,
    )
    recordEvaluation.run(
      evaluationRequest.caseId,
      evaluationRequest.caseRevision,
      now(),
      JSON.stringify(result),
    )
    return result
  }

  app.post('/evaluations', async (request, response) => {
    response.json(await evaluate(BranchEvaluationRequest.parse(request.body)))
  })

  mountA2a(app, {
    card: () =>
      branchAgentCard({
        serviceName: dependencies.serviceName,
        branches: dependencies.branches,
        baseUrl: dependencies.publicUrl(),
      }),
    executor: evaluationExecutor(evaluate),
    database: dependencies.database,
  })

  app.use(handleErrors)
  return app
}
