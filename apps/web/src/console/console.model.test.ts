import type { BusinessEvent, SpanRecord, StoredEvent } from '@durable-jev/contracts'
import { describe, expect, it } from 'vitest'
import {
  buildTraces,
  businessEvents,
  categoryOf,
  describeEvent,
  formatDuration,
  groupTimeline,
  isRecoveryEvent,
  judgements,
  spanRecords,
} from './console.model.js'

const at = (seconds: number) =>
  new Date(Date.parse('2026-11-02T08:00:00.000Z') + seconds * 1000).toISOString()
const common = {
  severity: 'info' as const,
  service: 'coordinator',
  correlationId: 'corr-C',
  caseId: 'C',
}
const event = (
  id: string,
  eventName: BusinessEvent['eventName'],
  seconds: number,
  extra: Partial<BusinessEvent> = {},
): BusinessEvent => ({
  ...common,
  kind: 'event',
  eventId: id,
  eventName,
  timestamp: at(seconds),
  ...extra,
})
const span = (
  id: string,
  name: string,
  start: number,
  seconds: number,
  extra: Partial<SpanRecord> = {},
): SpanRecord => ({
  ...common,
  kind: 'span',
  eventId: id,
  eventName: name,
  timestamp: at(start + seconds),
  startedAt: at(start),
  durationMs: seconds * 1000,
  traceId: 'a'.repeat(32),
  spanId: id.padEnd(16, '0'),
  ...extra,
})
const stored = (...events: (BusinessEvent | SpanRecord)[]): StoredEvent[] =>
  events.map((entry, index) => ({ sequence: index + 1, event: entry }))

describe('categoryOf and describeEvent', () => {
  it('separates code rules, Jev, people and recovery', () => {
    const rule = (evaluator: string) =>
      event('r', 'rule.evaluated', 0, { attributes: { evaluator, ruleId: 'R03' } })
    expect(categoryOf(rule('code'))).toBe('code')
    expect(categoryOf(rule('semantic'))).toBe('jev')
    expect(categoryOf(rule('humanGate'))).toBe('human')
    expect(categoryOf(event('x', 'information.requested', 0))).toBe('human')
    expect(categoryOf(event('x', 'run.resumed', 0))).toBe('recovery')
    expect(categoryOf(event('x', 'task.dispatched', 0))).toBe('service')
  })

  it('writes a plain line for an event', () => {
    expect(
      describeEvent(
        event('x', 'jev.completed', 0, {
          attributes: { provider: 'jev', ruleId: 'R03', answer: { type: 'noul', noul: 0.97 } },
        }),
      ),
    ).toBe('jev answered R03: noul 0.97')
    expect(
      describeEvent(
        event('x', 'case.recommended', 0, {
          attributes: { carrierId: 'CAR-GLACIER', vehicleId: 'V1' },
        }),
      ),
    ).toContain('not applied')
  })
})

describe('buildTraces', () => {
  it('nests spans under their parent with offsets from the start of the trace', () => {
    const [trace] = buildTraces(
      spanRecords(
        stored(
          span('root', 'case.evaluate', 0, 4),
          span('child', 'branch.evaluate', 1, 2, { parentSpanId: 'root'.padEnd(16, '0') }),
          span('leaf', 'rules.evaluate', 1.5, 1, { parentSpanId: 'child'.padEnd(16, '0') }),
        ),
      ),
    )
    expect(trace?.durationMs).toBe(4000)
    expect(trace?.rows.map((row) => [row.span.eventName, row.depth, row.offsetMs])).toEqual([
      ['case.evaluate', 0, 0],
      ['branch.evaluate', 1, 1000],
      ['rules.evaluate', 2, 1500],
    ])
  })

  it('shows a span whose parent was never stored as an orphan root, and keeps links', () => {
    const [first, second] = buildTraces(
      spanRecords(
        stored(
          span('one', 'run.started', 0, 1),
          span('two', 'agent.run.resumed', 10, 1, {
            traceId: 'b'.repeat(32),
            parentSpanId: 'gone'.padEnd(16, '0'),
            links: [
              { traceId: 'a'.repeat(32), spanId: 'one'.padEnd(16, '0'), relation: 'resumes' },
            ],
          }),
        ),
      ),
    )
    expect(first?.rows[0]?.orphan).toBe(false)
    expect(second?.rows[0]).toMatchObject({ depth: 0, orphan: true })
    expect(second?.links).toEqual([
      {
        fromSpanId: 'two'.padEnd(16, '0'),
        traceId: 'a'.repeat(32),
        spanId: 'one'.padEnd(16, '0'),
        relation: 'resumes',
      },
    ])
  })
})

describe('judgements', () => {
  it('pairs what Jev was asked and answered with the rule result that followed', () => {
    const attrs = { ruleId: 'R03', entityId: 'ITEM-1' }
    const rows = judgements([
      event('a', 'jev.requested', 0, { attributes: { ...attrs, inputHash: 'abc' } }),
      event('b', 'jev.completed', 1, {
        attributes: { ...attrs, answer: { type: 'noul', noul: 0.97 } },
      }),
      event('c', 'rule.evaluated', 2, {
        status: 'PASS',
        attributes: { ...attrs, evaluator: 'semantic' },
      }),
      event('d', 'rule.evaluated', 2, {
        status: 'PASS',
        attributes: { ruleId: 'R01', entityId: 'order', evaluator: 'code' },
      }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.requested?.eventId).toBe('a')
    expect(rows[0]?.completed?.eventId).toBe('b')
    expect(rows[0]?.decided?.status).toBe('PASS')
  })
})

describe('helpers', () => {
  it('recognises recovery events and linked spans, and formats durations', () => {
    expect(isRecoveryEvent(event('x', 'run.interrupted', 0))).toBe(true)
    expect(isRecoveryEvent(event('x', 'case.submitted', 0))).toBe(false)
    expect(
      isRecoveryEvent(
        span('s', 'x', 0, 1, {
          links: [{ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), relation: 'resumes' }],
        }),
      ),
    ).toBe(true)
    expect(
      businessEvents(stored(event('x', 'case.submitted', 0), span('s', 'x', 0, 1))),
    ).toHaveLength(1)
    expect([
      formatDuration(240),
      formatDuration(2500),
      formatDuration(125_000),
      formatDuration(7_200_000),
    ]).toEqual(['240 ms', '2.5 s', '2 min 5 s', '2.0 h'])
  })
})

describe('timeline order and grouping', () => {
  it('orders events by time even when they arrived out of turn', () => {
    const ordered = businessEvents([
      { sequence: 1, event: event('late', 'task.accepted', 5) },
      { sequence: 2, event: event('early', 'case.submitted', 0) },
    ])
    expect(ordered.map((entry) => entry.eventId)).toEqual(['early', 'late'])
  })

  it('folds a run of rule results into one row and leaves short runs alone', () => {
    const rule = (id: string, seconds: number, status: string) =>
      event(id, 'rule.evaluated', seconds, { status, attributes: { ruleId: id } })
    const items = groupTimeline([
      event('a', 'case.submitted', 0),
      rule('r1', 1, 'PASS'),
      rule('r2', 1, 'PASS'),
      rule('r3', 1, 'NOT_APPLICABLE'),
      rule('r4', 1, 'WAITING_HUMAN'),
      event('b', 'order.status_changed', 2),
      rule('r5', 3, 'PASS'),
    ])
    expect(items.map((item) => item.kind)).toEqual(['event', 'rules', 'event', 'event'])
    expect(items[1]).toMatchObject({ counts: { PASS: 2, NOT_APPLICABLE: 1, WAITING_HUMAN: 1 } })
  })

  it('describes a coordinator restart by the tasks that were still open', () => {
    expect(
      describeEvent(
        event('x', 'run.resumed', 0, {
          attributes: { scope: 'coordinator', openHumanTasks: ['HT-1'] },
        }),
      ),
    ).toBe('Coordinator restarted; still waiting for HT-1')
  })
})
