import { openDatabase, readUnpublishedOutboxEvents } from '@durable-jev/store'
import { describe, expect, it } from 'vitest'
import { OutboxRelay } from './outbox.relay.js'
import { redact, redactHeaders } from './redact.helpers.js'
import { Telemetry } from './telemetry.service.js'

describe('redact', () => {
  it('hides secrets, cuts long text and keeps everything else', () => {
    const result = redact({
      ruleId: 'R10',
      apiKey: 'sk-live-123',
      nested: { Authorization: 'Bearer abc', ok: 1 },
      document: 'x'.repeat(1000),
    }) as Record<string, unknown>
    expect(result).toMatchObject({
      ruleId: 'R10',
      apiKey: '[redacted]',
      nested: { Authorization: '[redacted]', ok: 1 },
    })
    expect(String(result.document)).toContain('[truncated 600 chars]')
    expect(redactHeaders({ authorization: 'Bearer abc', accept: 'json' })).toEqual({
      authorization: '[redacted]',
      accept: 'json',
    })
  })
})

describe('Telemetry', () => {
  it('writes a validated, redacted event to the outbox with the case correlation id', () => {
    const database = openDatabase(':memory:')
    const telemetry = new Telemetry('coordinator', database, () => '2026-11-02T08:00:00.000Z')
    const event = telemetry.emit({
      eventName: 'jev.completed',
      caseId: 'CASE-1',
      caseRevision: 1,
      attributes: { ruleId: 'R03', apiKey: 'secret' },
    })
    expect(event).toMatchObject({
      kind: 'event',
      correlationId: 'corr-CASE-1',
      service: 'coordinator',
      severity: 'info',
    })
    const [stored] = readUnpublishedOutboxEvents(database)
    expect(stored).toMatchObject({ eventType: 'jev.completed', correlationId: 'corr-CASE-1' })
    expect(JSON.stringify(stored?.payload)).not.toContain('secret')
  })

  it('marks an event with an error code as an error and does not repeat an event id', () => {
    const database = openDatabase(':memory:')
    const telemetry = new Telemetry('coordinator', database)
    const failed = telemetry.emit({
      eventName: 'task.failed',
      caseId: 'CASE-1',
      errorCode: 'BRANCH_UNAVAILABLE',
      eventId: 'EV-FIXED',
    })
    telemetry.emit({ eventName: 'task.failed', caseId: 'CASE-1', eventId: 'EV-FIXED' })
    expect(failed.severity).toBe('error')
    expect(readUnpublishedOutboxEvents(database)).toHaveLength(1)
  })
})

describe('OutboxRelay', () => {
  const setup = () => {
    const database = openDatabase(':memory:')
    const telemetry = new Telemetry('coordinator', database)
    for (const caseId of ['A', 'B', 'C']) telemetry.emit({ eventName: 'case.submitted', caseId })
    return { database }
  }

  it('keeps events when the collector is down and delivers them once it is back', async () => {
    const { database } = setup()
    let down = true
    const received: unknown[] = []
    const relay = new OutboxRelay({
      database,
      collectorUrl: 'http://collector.test',
      fetch: async (_url, init) => {
        if (down) throw new Error('connection refused')
        received.push(...JSON.parse(String(init?.body)).events)
        return new Response(null, { status: 202 })
      },
    })
    expect(await relay.flush()).toMatchObject({
      pending: 3,
      consecutiveFailures: 1,
      lastError: 'connection refused',
    })
    expect(readUnpublishedOutboxEvents(database)).toHaveLength(3)

    down = false
    expect(await relay.flush()).toMatchObject({ pending: 0, published: 3, consecutiveFailures: 0 })
    expect(received).toHaveLength(3)
    expect(await relay.flush()).toMatchObject({ published: 3 })
    expect(received).toHaveLength(3)
  })

  it('treats a collector error as a failure and sends in batches', async () => {
    const { database } = setup()
    const sizes: number[] = []
    let failing = true
    const relay = new OutboxRelay({
      database,
      collectorUrl: 'http://collector.test',
      batchSize: 2,
      fetch: async (_url, init) => {
        if (failing) return new Response(null, { status: 503 })
        sizes.push(JSON.parse(String(init?.body)).events.length)
        return new Response(null, { status: 202 })
      },
    })
    expect((await relay.flush()).lastError).toBe('collector answered 503')
    failing = false
    await relay.flush()
    expect(sizes).toEqual([2, 1])
  })
})
