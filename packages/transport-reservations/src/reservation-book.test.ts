import { readFileSync } from 'node:fs'
import type { Shipment } from '@durable-jev/contracts'
import { openDatabase } from '@durable-jev/store'
import { describe, expect, it } from 'vitest'
import {
  countActiveReservations,
  ensurePlanReservation,
  reservationMigrations,
} from './reservation-book.js'

const shipment: Shipment = JSON.parse(
  readFileSync(new URL('../../../eval/materials/cases/LOG-001.json', import.meta.url), 'utf8'),
).shipment

describe('ensurePlanReservation', () => {
  it('reserves each leg once however often the plan is evaluated', () => {
    const database = openDatabase(':memory:', reservationMigrations)
    expect(ensurePlanReservation(database, shipment)).toBe(true)
    expect(ensurePlanReservation(database, shipment)).toBe(true)
    expect(countActiveReservations(database, shipment.caseId, shipment.entityVersions.route)).toBe(
      1,
    )
  })

  it('reserves again for a new route version', () => {
    const database = openDatabase(':memory:', reservationMigrations)
    ensurePlanReservation(database, shipment)
    const rerouted = { ...shipment, entityVersions: { ...shipment.entityVersions, route: 2 } }
    ensurePlanReservation(database, rerouted)
    expect(countActiveReservations(database, shipment.caseId, 2)).toBe(1)
  })
})
