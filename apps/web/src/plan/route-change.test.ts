import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Shipment } from '@durable-jev/contracts'
import { describe, expect, it } from 'vitest'
import { hubChoices, routeThroughHub } from './route-change.model.js'

const caseFile = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, '../../../../eval/materials/cases/LOG-007.json'),
    'utf8',
  ),
) as { shipment: Shipment; eventScript: { change?: { legs: unknown[] } }[] }

describe('routing through a hub', () => {
  it('builds the same replacement the replay uses for LOG-007', () => {
    const change = routeThroughHub(caseFile.shipment, 'SHA-HUB')
    const replayed = caseFile.eventScript.find((step) => step.change)?.change
    expect(change.legs).toEqual(replayed?.legs)
  })

  it('offers hubs that are not the ends of the route', () => {
    expect(
      hubChoices(caseFile.shipment, [{ location: 'SHA-HUB' }, { location: 'SZX-HUB' }]),
    ).toEqual(['SHA-HUB', 'SZX-HUB'])
    expect(hubChoices(caseFile.shipment, [{ location: 'CAN-CLINIC' }])).toEqual([])
  })
})
