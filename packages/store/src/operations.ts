import { createHash } from 'node:crypto'
import { canonicalJson } from '@durable-jev/contracts'
import type { Db } from './database.js'

export type OperationOutcome<R> =
  | { status: 'applied'; result: R }
  | { status: 'duplicate'; result: R }

export interface OperationRecord {
  operationId: string
  kind: string
  result: unknown
  appliedAt: string
}

export class OperationConflictError extends Error {
  constructor(readonly operationId: string) {
    super(`operation ${operationId} was already applied with a different request`)
    this.name = 'OperationConflictError'
  }
}

function requestHash(request: unknown): string {
  return createHash('sha256').update(canonicalJson(request)).digest('hex')
}

interface OperationRow {
  operation_id: string
  kind: string
  request_hash: string
  result_json: string
  applied_at: string
}

export function runOnce<R>(
  db: Db,
  operation: { operationId: string; kind: string; request: unknown },
  apply: () => R,
): OperationOutcome<R> {
  const hash = requestHash(operation.request)
  return db
    .transaction((): OperationOutcome<R> => {
      const existing = db
        .prepare<[string], OperationRow>('SELECT * FROM operations WHERE operation_id = ?')
        .get(operation.operationId)
      if (existing) {
        if (existing.request_hash !== hash || existing.kind !== operation.kind) {
          throw new OperationConflictError(operation.operationId)
        }
        return { status: 'duplicate', result: JSON.parse(existing.result_json) as R }
      }
      const result = apply()
      db.prepare(
        'INSERT INTO operations (operation_id, kind, request_hash, result_json, applied_at) VALUES (?, ?, ?, ?, ?)',
      ).run(
        operation.operationId,
        operation.kind,
        hash,
        JSON.stringify(result ?? null),
        new Date().toISOString(),
      )
      return { status: 'applied', result }
    })
    .immediate()
}

export function operationStatus(db: Db, operationId: string): OperationRecord | undefined {
  const row = db
    .prepare<[string], OperationRow>('SELECT * FROM operations WHERE operation_id = ?')
    .get(operationId)
  if (!row) return undefined
  return {
    operationId: row.operation_id,
    kind: row.kind,
    result: JSON.parse(row.result_json),
    appliedAt: row.applied_at,
  }
}
