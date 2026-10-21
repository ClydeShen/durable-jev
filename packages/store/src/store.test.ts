import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Db, migrate, openDatabase, openStore, storeMigrations } from './database.js'
import { OperationConflictError, operationStatus, runOnce } from './operations.js'
import { appendToOutbox, markPublished, unpublishedEvents } from './outbox.js'

const reservations = [
  {
    version: 100,
    name: 'reservations',
    sql: 'CREATE TABLE reservations (operation_id TEXT PRIMARY KEY, leg_id TEXT NOT NULL)',
  },
]

function freshStore(): Db {
  return openStore(':memory:', reservations)
}

function reserve(db: Db, legId: string, operationId = `LOG-001:r1:reserve_transport:${legId}`) {
  return runOnce(db, { operationId, kind: 'reserve_transport', request: { legId } }, () => {
    db.prepare('INSERT INTO reservations (operation_id, leg_id) VALUES (?, ?)').run(
      operationId,
      legId,
    )
    appendToOutbox(db, { caseId: 'LOG-001', eventName: 'tool.completed', payload: { legId } })
    return { reservationId: `RES-${legId}` }
  })
}

const countOf = (db: Db, table: string) =>
  (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n

describe('runOnce', () => {
  it('applies the same operationId only once', () => {
    const db = freshStore()
    expect(reserve(db, 'LEG-1')).toEqual({
      status: 'applied',
      result: { reservationId: 'RES-LEG-1' },
    })
    expect(reserve(db, 'LEG-1')).toEqual({
      status: 'duplicate',
      result: { reservationId: 'RES-LEG-1' },
    })
    expect(countOf(db, 'reservations')).toBe(1)
    expect(countOf(db, 'outbox')).toBe(1)
  })

  it('rejects reusing an operationId for a different request', () => {
    const db = freshStore()
    reserve(db, 'LEG-1', 'op-1')
    expect(() => reserve(db, 'LEG-2', 'op-1')).toThrow(OperationConflictError)
    expect(countOf(db, 'reservations')).toBe(1)
  })

  it('rolls back the business write, the event and the operation together', () => {
    const db = freshStore()
    expect(() =>
      runOnce(db, { operationId: 'op-fail', kind: 'reserve_transport', request: {} }, () => {
        db.prepare('INSERT INTO reservations (operation_id, leg_id) VALUES (?, ?)').run(
          'op-fail',
          'LEG-9',
        )
        appendToOutbox(db, { eventName: 'tool.completed', payload: {} })
        throw new Error('carrier rejected')
      }),
    ).toThrow('carrier rejected')
    expect(countOf(db, 'reservations')).toBe(0)
    expect(countOf(db, 'outbox')).toBe(0)
    expect(operationStatus(db, 'op-fail')).toBeUndefined()
  })

  it('answers get_operation_status after a restart', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'store-')), 'cargo.sqlite')
    const first = openStore(path, reservations)
    reserve(first, 'LEG-1', 'op-1')
    first.close()
    const reopened = openStore(path, reservations)
    expect(operationStatus(reopened, 'op-1')).toMatchObject({
      kind: 'reserve_transport',
      result: { reservationId: 'RES-LEG-1' },
    })
    expect(reserve(reopened, 'LEG-1', 'op-1').status).toBe('duplicate')
    reopened.close()
  })
})

describe('migrate', () => {
  it('applies each migration once', () => {
    const db = openDatabase(':memory:')
    expect(migrate(db, [...storeMigrations, ...reservations])).toEqual([1, 100])
    expect(migrate(db, [...storeMigrations, ...reservations])).toEqual([])
  })
})

describe('outbox', () => {
  it('hands out unpublished events in order and forgets published ones', () => {
    const db = freshStore()
    const first = appendToOutbox(db, {
      caseId: 'LOG-001',
      eventName: 'case.submitted',
      payload: { revision: 1 },
    })
    appendToOutbox(db, {
      caseId: 'LOG-001',
      eventName: 'rule.evaluated',
      payload: { ruleId: 'R02' },
    })
    expect(unpublishedEvents(db).map((event) => event.eventName)).toEqual([
      'case.submitted',
      'rule.evaluated',
    ])
    markPublished(db, [first])
    expect(unpublishedEvents(db).map((event) => event.eventName)).toEqual(['rule.evaluated'])
  })
})
