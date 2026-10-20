import type { StoredEvent } from '@durable-jev/contracts'
import { describe, expect, it } from 'vitest'
import { cursorOf, mergeStored } from './observe-stream.js'

const stored = (sequence: number, eventId = `e${sequence}`): StoredEvent => ({
  sequence,
  event: {
    kind: 'event',
    eventName: 'rule.evaluated',
    eventId,
    timestamp: '2026-11-02T08:00:00.000Z',
    severity: 'info',
    service: 'coordinator',
    correlationId: 'corr-C',
    caseId: 'C',
  },
})

describe('mergeStored', () => {
  it('keeps an event once when a snapshot and the stream overlap', () => {
    const merged = mergeStored([stored(1), stored(2)], [stored(2), stored(3)])
    expect(merged.map((entry) => entry.sequence)).toEqual([1, 2, 3])
  })

  it('puts late arrivals in stream order and leaves the list alone when nothing is new', () => {
    const current = [stored(1), stored(3)]
    expect(mergeStored(current, [stored(2)]).map((entry) => entry.sequence)).toEqual([1, 2, 3])
    expect(mergeStored(current, [stored(3)])).toBe(current)
  })
})

describe('cursorOf', () => {
  it('continues from the highest sequence seen, or from the snapshot when that is higher', () => {
    expect(cursorOf([stored(4), stored(9)])).toBe(9)
    expect(cursorOf([stored(4)], 12)).toBe(12)
    expect(cursorOf([])).toBe(0)
  })
})
