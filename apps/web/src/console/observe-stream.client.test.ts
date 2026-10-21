import type { StoredEvent } from '@durable-jev/contracts'
import { describe, expect, it } from 'vitest'
import type { CaseSummary } from './console.model.js'
import { cursorOf, mergeStored, reconcileSnapshot } from './observe-stream.client.js'

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

describe('reconcileSnapshot', () => {
  const summary = (correlationId: string): CaseSummary => ({
    correlationId,
    caseId: correlationId.replace('corr-', ''),
    eventCount: 0,
    errorCount: 0,
    services: [],
    firstAt: '2026-11-02T08:00:00.000Z',
    lastAt: '2026-11-02T08:00:00.000Z',
    lastEventName: 'case.submitted',
    totalMs: 0,
    machineMs: 0,
    humanWaitMs: 0,
  })
  const shown = (correlationId: string, ...sequences: number[]) => ({
    summary: summary(correlationId),
    latest: Math.max(...sequences),
    events: sequences.map((sequence) => stored(sequence)),
  })

  it('merges a snapshot of the same case into what is on screen', () => {
    const result = reconcileSnapshot(shown('corr-A', 1, 2), shown('corr-A', 2, 3))
    expect(result.events.map((entry) => entry.sequence)).toEqual([1, 2, 3])
  })

  it('shows only the new case after switching to another one', () => {
    const result = reconcileSnapshot(shown('corr-A', 1, 2), shown('corr-B', 7, 8))
    expect(result.events.map((entry) => entry.sequence)).toEqual([7, 8])
    expect(result.summary.correlationId).toBe('corr-B')
  })

  it('starts over when the collector history is shorter than what was seen', () => {
    const result = reconcileSnapshot(shown('corr-A', 40, 41), shown('corr-A', 1, 2))
    expect(result.events.map((entry) => entry.sequence)).toEqual([1, 2])
  })

  it('takes the snapshot as is when nothing is shown yet', () => {
    expect(reconcileSnapshot(undefined, shown('corr-A', 1)).events).toHaveLength(1)
  })
})
