import { readFileSync } from 'node:fs'
import type { Shipment } from '@durable-jev/contracts'
import { describe, expect, it } from 'vitest'
import { applyPlanChange } from './plan-change.js'

const shipment: Shipment = JSON.parse(
  readFileSync(new URL('../../../eval/materials/cases/LOG-001.json', import.meta.url), 'utf8'),
).shipment

describe('applyPlanChange', () => {
  it('replaces legs as a new route and carrier version', () => {
    const [leg] = shipment.legs
    const applied = applyPlanChange(shipment, {
      kind: 'replaceLegs',
      legs: [{ ...(leg as Shipment['legs'][number]), vehicleId: 'VEH-NL-VAN-1T' as never }],
    })
    expect(applied.triggers).toEqual(['route', 'carrier', 'vehicle'])
    expect(applied.shipment.caseRevision).toBe(2)
    expect(applied.shipment.entityVersions).toMatchObject({
      route: 2,
      carrier: 2,
      cargo: 1,
      quote: 1,
    })
  })

  it('records a new packaging version on one cargo item', () => {
    const itemId = shipment.cargoItems[0]?.cargoItemId as string
    const applied = applyPlanChange(shipment, {
      kind: 'recordPackaging',
      cargoItemId: itemId as never,
      packagingId: 'PKG-2',
    })
    expect(applied.triggers).toEqual(['cargo'])
    expect(applied.shipment.entityVersions.cargo).toBe(2)
    expect(applied.shipment.cargoItems[0]?.packagingId).toBe('PKG-2')
  })

  it('rejects a change to an unknown leg or item', () => {
    expect(() =>
      applyPlanChange(shipment, {
        kind: 'recordPackaging',
        cargoItemId: 'NOPE' as never,
        packagingId: 'PKG',
      }),
    ).toThrow('not part of')
  })
})
