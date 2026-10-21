import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase, type StoreDatabase } from './database.helpers.js'
import { executeOnce, getOperationStatus, OperationConflictError } from './operations.repository.js'
import {
  appendOutboxEvent,
  markOutboxEventsPublished,
  readUnpublishedOutboxEvents,
} from './outbox.repository.js'

const reservationsMigration = {
  id: 'test-001-reservations',
  sql: 'CREATE TABLE reservations (reservation_id INTEGER PRIMARY KEY, vehicle_id TEXT NOT NULL)',
}

const reserveVehicle = (database: StoreDatabase, vehicleId: string) => {
  const { lastInsertRowid } = database
    .prepare('INSERT INTO reservations (vehicle_id) VALUES (?)')
    .run(vehicleId)
  return { reservationId: Number(lastInsertRowid) }
}

const countReservations = (database: StoreDatabase) =>
  (database.prepare('SELECT COUNT(*) AS count FROM reservations').get() as { count: number }).count

const reservation = {
  operationId: 'CASE-1:r1:reserve_transport:leg-1',
  actionType: 'reserve_transport',
  request: { vehicleId: 'V-1' },
}

describe('executeOnce', () => {
  it('applies the same operationId only once', () => {
    const database = openDatabase(':memory:', [reservationsMigration])
    const first = executeOnce(database, reservation, () => reserveVehicle(database, 'V-1'))
    const retry = executeOnce(database, reservation, () => reserveVehicle(database, 'V-1'))

    expect(first.replayed).toBe(false)
    expect(retry).toMatchObject({ replayed: true, result: first.result })
    expect(countReservations(database)).toBe(1)
  })

  it('rolls back the side effect when recording fails', () => {
    const database = openDatabase(':memory:', [reservationsMigration])
    expect(() =>
      executeOnce(database, reservation, () => {
        reserveVehicle(database, 'V-1')
        throw new Error('carrier rejected')
      }),
    ).toThrow('carrier rejected')
    expect(countReservations(database)).toBe(0)
    expect(getOperationStatus(database, reservation.operationId)).toEqual({ status: 'NOT_FOUND' })
  })

  it('refuses to reuse an operationId for a different action', () => {
    const database = openDatabase(':memory:', [reservationsMigration])
    executeOnce(database, reservation, () => reserveVehicle(database, 'V-1'))
    expect(() =>
      executeOnce(database, { ...reservation, actionType: 'cancel_reservation' }, () => null),
    ).toThrow(OperationConflictError)
  })
})

describe('durability across reopen', () => {
  let directory: string | undefined
  afterEach(() => directory && rmSync(directory, { recursive: true, force: true }))

  it('reports an operation applied before a restart', () => {
    directory = mkdtempSync(join(tmpdir(), 'store-'))
    const filePath = join(directory, 'service.sqlite')
    const beforeRestart = openDatabase(filePath, [reservationsMigration])
    executeOnce(beforeRestart, reservation, () => reserveVehicle(beforeRestart, 'V-1'))
    beforeRestart.close()

    const afterRestart = openDatabase(filePath, [reservationsMigration])
    expect(getOperationStatus(afterRestart, reservation.operationId)).toMatchObject({
      status: 'APPLIED',
      result: { reservationId: 1 },
    })
    afterRestart.close()
  })
})

describe('outbox', () => {
  it('deduplicates events by eventId and tracks publication', () => {
    const database = openDatabase(':memory:')
    const event = { eventId: 'evt-1', eventType: 'check.evaluated', payload: { ruleId: 'R01' } }
    appendOutboxEvent(database, event)
    appendOutboxEvent(database, event)

    const unpublished = readUnpublishedOutboxEvents(database)
    expect(unpublished).toHaveLength(1)
    markOutboxEventsPublished(
      database,
      unpublished.map((recorded) => recorded.sequence),
    )
    expect(readUnpublishedOutboxEvents(database)).toHaveLength(0)
  })
})
