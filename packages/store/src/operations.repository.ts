import type { StoreDatabase } from './database.helpers.js'

export type OperationRequest = {
  operationId: string
  actionType: string
  request: unknown
}

export type OperationOutcome<Result> = {
  operationId: string
  result: Result
  replayed: boolean
  appliedAt: string
}

type OperationRow = { result_json: string; applied_at: string; action_type: string }

export class OperationConflictError extends Error {
  constructor(operationId: string, existingActionType: string, requestedActionType: string) {
    super(
      `operation ${operationId} was already applied as ${existingActionType}, not ${requestedActionType}`,
    )
  }
}

export const executeOnce = <Result>(
  database: StoreDatabase,
  operation: OperationRequest,
  applySideEffect: () => Result,
): OperationOutcome<Result> => {
  const run = database.transaction((): OperationOutcome<Result> => {
    const existing = findOperationRow(database, operation.operationId)
    if (existing) {
      if (existing.action_type !== operation.actionType) {
        throw new OperationConflictError(
          operation.operationId,
          existing.action_type,
          operation.actionType,
        )
      }
      return {
        operationId: operation.operationId,
        result: JSON.parse(existing.result_json) as Result,
        replayed: true,
        appliedAt: existing.applied_at,
      }
    }
    const result = applySideEffect()
    const appliedAt = new Date().toISOString()
    database
      .prepare(
        `INSERT INTO operations (operation_id, action_type, request_json, result_json, applied_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        operation.operationId,
        operation.actionType,
        JSON.stringify(operation.request),
        JSON.stringify(result ?? null),
        appliedAt,
      )
    return { operationId: operation.operationId, result, replayed: false, appliedAt }
  })
  return run.immediate()
}

export type OperationStatus<Result> =
  | { status: 'APPLIED'; actionType: string; result: Result; appliedAt: string }
  | { status: 'NOT_FOUND' }

export const getOperationStatus = <Result>(
  database: StoreDatabase,
  operationId: string,
): OperationStatus<Result> => {
  const row = findOperationRow(database, operationId)
  if (!row) return { status: 'NOT_FOUND' }
  return {
    status: 'APPLIED',
    actionType: row.action_type,
    result: JSON.parse(row.result_json) as Result,
    appliedAt: row.applied_at,
  }
}

const findOperationRow = (
  database: StoreDatabase,
  operationId: string,
): OperationRow | undefined => {
  return database
    .prepare('SELECT result_json, applied_at, action_type FROM operations WHERE operation_id = ?')
    .get(operationId) as OperationRow | undefined
}
