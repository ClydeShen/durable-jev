import type { AddressInfo } from 'node:net'
import { openDatabase } from '@durable-jev/store'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { summarizeCase, unionDurationMs } from './case-summary.model.js'
import { createObservabilityApp } from './observability.app.js'
import { ObservationStore, observationMigrations } from './observation.repository.js'

const at = (seconds: number) =>
  new Date(Date.parse('2026-11-02T08:00:00.000Z') + seconds * 1000).toISOString()
const base = (eventId: string, seconds: number, caseId = 'CASE-1') => ({
  eventId,
  timestamp: at(seconds),
  severity: 'info',
  service: 'coordinator',
  correlationId: `corr-${caseId}`,
  caseId,
})
const event = (eventId: string, eventName: string, seconds: number, extra: object = {}) => ({
  ...base(eventId, seconds),
  kind: 'event',
  eventName,
  ...extra,
})
const span = (
  eventId: string,
  startSeconds: number,
  durationSeconds: number,
  name = 'branch.evaluate',
) => ({
  ...base(eventId, startSeconds + durationSeconds),
  kind: 'span',
  eventName: name,
  traceId: 'a'.repeat(32),
  spanId: eventId
    .padEnd(16, '0')
    .slice(0, 16)
    .replace(/[^0-9a-f]/g, '0'),
  startedAt: at(startSeconds),
  durationMs: durationSeconds * 1000,
})

const newStore = () => new ObservationStore(openDatabase(':memory:', observationMigrations))

describe('ObservationStore', () => {
  it('stores an event once however often it is sent, and reports what it rejected', () => {
    const store = newStore()
    const first = store.ingest([event('e1', 'case.submitted', 0), { nonsense: true }])
    expect(first).toMatchObject({ accepted: ['e1'], duplicates: [] })
    expect(first.rejected).toHaveLength(1)
    expect(store.ingest([event('e1', 'case.submitted', 0)])).toMatchObject({
      accepted: [],
      duplicates: ['e1'],
    })
    expect(store.list()).toHaveLength(1)
  })

  it('filters by case and continues from a cursor', () => {
    const store = newStore()
    store.ingest([
      event('e1', 'case.submitted', 0),
      { ...event('e2', 'case.submitted', 1), caseId: 'CASE-2', correlationId: 'corr-CASE-2' },
      event('e3', 'rule.evaluated', 2),
    ])
    expect(
      store.list({ correlationId: 'corr-CASE-1' }).map((entry) => entry.event.eventId),
    ).toEqual(['e1', 'e3'])
    const [firstEntry] = store.list()
    expect(store.list({ after: firstEntry?.sequence }).map((entry) => entry.event.eventId)).toEqual(
      ['e2', 'e3'],
    )
    expect(store.latestSequence()).toBe(3)
  })
})

describe('summarizeCase', () => {
  it('counts parallel spans once', () => {
    expect(
      unionDurationMs([
        [0, 4000],
        [1000, 3000],
        [3500, 6000],
      ]),
    ).toBe(6000)
  })

  it('keeps the time spent waiting for a person out of machine time', () => {
    const store = newStore()
    store.ingest([
      event('e1', 'case.submitted', 0),
      span('s1', 0, 2),
      span('s2', 1, 2),
      event('e2', 'information.requested', 3, { attributes: { humanTaskId: 'HT-1' } }),
      event('e3', 'information.received', 3603, { attributes: { humanTaskId: 'HT-1' } }),
      span('s3', 3603, 1),
      event('e4', 'order.status_changed', 3604, { attributes: { to: 'READY_TO_DISPATCH' } }),
    ])
    const summary = summarizeCase(store.list().map((entry) => entry.event))
    expect(summary).toMatchObject({
      totalMs: 3604_000,
      machineMs: 4000,
      humanWaitMs: 3600_000,
      orderStatus: 'READY_TO_DISPATCH',
      lastEventName: 'order.status_changed',
    })
  })

  it('uses time, not arrival order, when services deliver their events out of turn', () => {
    const store = newStore()
    store.ingest([
      { ...event('late', 'task.accepted', 5), service: 'cargo-assurance' },
      event('early', 'case.submitted', 0),
      span('s1', 1, 2),
    ])
    const summary = summarizeCase(store.list().map((entry) => entry.event))
    expect(summary).toMatchObject({
      totalMs: 5000,
      machineMs: 2000,
      lastEventName: 'task.accepted',
    })
    expect(summary?.firstAt).toBe(at(0))
  })

  it('counts overlapping waits for several people once', () => {
    const store = newStore()
    const request = (id: string, seconds: number) =>
      event(id, 'information.requested', seconds, { attributes: { humanTaskId: id } })
    const answer = (id: string, seconds: number) =>
      event(`${id}-a`, 'information.received', seconds, { attributes: { humanTaskId: id } })
    store.ingest([request('HT-1', 0), request('HT-2', 10), answer('HT-1', 30), answer('HT-2', 40)])
    expect(summarizeCase(store.list().map((entry) => entry.event))?.humanWaitMs).toBe(40_000)
  })

  it('counts a request nobody has answered yet up to the last event', () => {
    const store = newStore()
    store.ingest([
      event('e1', 'information.requested', 0, { attributes: { humanTaskId: 'HT-1' } }),
      event('e2', 'rule.evaluated', 120),
    ])
    expect(summarizeCase(store.list().map((entry) => entry.event))?.humanWaitMs).toBe(120_000)
  })
})

describe('observability HTTP API', () => {
  let baseUrl = ''
  let close = () => {}
  beforeAll(async () => {
    const server = createObservabilityApp(newStore()).listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    close = () => server.close()
  })
  afterAll(() => close())

  it('ingests, lists cases and serves one case with its events', async () => {
    const post = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events: [event('e1', 'case.submitted', 0), span('s1', 0, 1)] }),
    })
    expect(post.status).toBe(202)
    expect((await (await fetch(`${baseUrl}/cases`)).json()).cases[0]).toMatchObject({
      correlationId: 'corr-CASE-1',
      eventCount: 2,
    })
    const one = await (await fetch(`${baseUrl}/cases/corr-CASE-1`)).json()
    expect(one.events).toHaveLength(2)
    expect((await fetch(`${baseUrl}/cases/corr-NOPE`)).status).toBe(404)
    expect((await fetch(`${baseUrl}/events?limit=abc`)).status).toBe(400)
  })
})
