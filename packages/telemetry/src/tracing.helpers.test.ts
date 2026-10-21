import type { AddressInfo } from 'node:net'
import type { SpanRecord } from '@durable-jev/contracts'
import { openDatabase, readUnpublishedOutboxEvents } from '@durable-jev/store'
import express from 'express'
import { beforeEach, describe, expect, it } from 'vitest'
import { Telemetry } from './telemetry.service.js'
import {
  annotateActiveSpan,
  currentTraceparent,
  fetchWithTrace,
  initTracing,
  startSpan,
  tracingMiddleware,
  withSpan,
} from './tracing.helpers.js'

let database = openDatabase(':memory:')
beforeEach(() => {
  database = openDatabase(':memory:')
  initTracing(new Telemetry('test', database))
})

const spans = () =>
  readUnpublishedOutboxEvents(database, 10_000)
    .map((row) => row.payload as SpanRecord)
    .filter((event) => event.kind === 'span')
const byName = (name: string) => spans().find((span) => span.eventName === name) as SpanRecord

describe('tracing', () => {
  it('stores nested spans with their parent, duration and case', async () => {
    await withSpan('case.evaluate', { caseId: 'CASE-1', caseRevision: 2 }, async () => {
      await withSpan(
        'branch.evaluate',
        { caseId: 'CASE-1', attributes: { evaluator: 'cargo' } },
        async () => {
          await new Promise((wait) => setTimeout(wait, 15))
        },
      )
    })
    const parent = byName('case.evaluate')
    const child = byName('branch.evaluate')
    expect(child.traceId).toBe(parent.traceId)
    expect(child.parentSpanId).toBe(parent.spanId)
    expect(parent.parentSpanId).toBeUndefined()
    expect(child.durationMs).toBeGreaterThanOrEqual(10)
    expect(parent).toMatchObject({
      caseId: 'CASE-1',
      caseRevision: 2,
      correlationId: 'corr-CASE-1',
      status: 'ok',
    })
    expect(child.attributes).toEqual({ evaluator: 'cargo' })
  })

  it('records a failure as an error span and rethrows it', async () => {
    await expect(
      withSpan('branch.evaluate', { caseId: 'CASE-1' }, async () => {
        throw new TypeError('boom')
      }),
    ).rejects.toThrow('boom')
    expect(byName('branch.evaluate')).toMatchObject({
      status: 'error',
      errorCode: 'TypeError',
      severity: 'error',
    })
  })

  it('leaves out spans that never learned their case', async () => {
    await withSpan('GET /health', { caseId: 'x' }, async () => {})
    const span = startSpan('plain', { caseId: 'ignored' })
    span.setAttribute('caseId', 5)
    span.end()
    expect(spans().map((entry) => entry.eventName)).toEqual(['GET /health'])
  })

  it('starts a new trace that links back to an earlier one', async () => {
    let earlier: string | undefined
    await withSpan('information.requested', { caseId: 'CASE-1' }, async () => {
      earlier = currentTraceparent()
    })
    const later = startSpan('human.act', {
      caseId: 'CASE-1',
      root: true,
      links: [{ traceparent: earlier ?? '', relation: 'answers' }],
    })
    later.end()
    const first = byName('information.requested')
    const second = byName('human.act')
    expect(second.traceId).not.toBe(first.traceId)
    expect(second.links).toEqual([
      { traceId: first.traceId, spanId: first.spanId, relation: 'answers' },
    ])
  })

  it('carries one trace from a caller to the service it calls', async () => {
    const service = express()
    service.use(tracingMiddleware())
    service.post('/work', (_request, response) => {
      annotateActiveSpan({ caseId: 'CASE-1', caseRevision: 1 })
      response.json({ ok: true })
    })
    const server = service.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/work`
    try {
      await withSpan('branch.evaluate', { caseId: 'CASE-1' }, () =>
        fetchWithTrace(url, { method: 'POST' }),
      )
    } finally {
      server.close()
    }
    const caller = byName('branch.evaluate')
    const handled = byName('POST /work')
    expect(handled.traceId).toBe(caller.traceId)
    expect(handled.parentSpanId).toBe(caller.spanId)
    expect(handled.attributes).toMatchObject({ httpStatus: 200 })
  })
})
