import type { AddressInfo } from 'node:net'
import { openDatabase } from '@durable-jev/store'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createObservabilityApp } from './observability.app.js'
import { ObservationStore, observationMigrations } from './observation.repository.js'

const event = (id: string, caseId = 'CASE-1', seconds = 0) => ({
  eventId: id,
  kind: 'event',
  eventName: 'rule.evaluated',
  timestamp: new Date(Date.parse('2026-11-02T08:00:00.000Z') + seconds * 1000).toISOString(),
  severity: 'info',
  service: 'coordinator',
  correlationId: `corr-${caseId}`,
  caseId,
})

const store = new ObservationStore(openDatabase(':memory:', observationMigrations))
let baseUrl = ''
let close = () => {}
beforeAll(async () => {
  const server = createObservabilityApp(store).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  close = () => {
    server.closeAllConnections()
    server.close()
  }
})
afterAll(() => close())

// A tiny SSE client: collects messages until it has `count` of them, then hangs up.
const read = async (path: string, count: number, headers: Record<string, string> = {}) => {
  const controller = new AbortController()
  const response = await fetch(`${baseUrl}${path}`, { headers, signal: controller.signal })
  const reader = response.body?.getReader()
  const decoder = new TextDecoder()
  const messages: { id: string; data: { sequence: number; event: { eventId: string } } }[] = []
  let buffer = ''
  while (reader && messages.length < count) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    for (const block of buffer.split('\n\n').slice(0, -1)) {
      const id = /^id: (.*)$/m.exec(block)?.[1]
      const data = /^data: (.*)$/m.exec(block)?.[1]
      if (id && data) messages.push({ id, data: JSON.parse(data) })
    }
    buffer = buffer.slice(buffer.lastIndexOf('\n\n') + 2)
  }
  controller.abort()
  return messages
}

const ids = (messages: Awaited<ReturnType<typeof read>>) =>
  messages.map((message) => message.data.event.eventId)

describe('event stream', () => {
  it('replays what was stored before it connected, then follows new events', async () => {
    store.ingest([event('a'), event('b')])
    const reading = read('/stream', 3)
    await new Promise((wait) => setTimeout(wait, 100))
    store.ingest([event('c')])
    const messages = await reading
    expect(ids(messages)).toEqual(['a', 'b', 'c'])
    expect(messages.map((message) => message.id)).toEqual(
      messages.map((message) => String(message.data.sequence)),
    )
  })

  it('gives a reconnecting client exactly the events it missed, once and in order', async () => {
    const first = await read('/stream?after=0', 3)
    const lastSeen = first.at(-1)?.id as string
    // The connection is gone; events keep arriving.
    store.ingest([event('d'), event('e')])
    store.ingest([event('e'), event('f')])
    const second = await read('/stream', 3, { 'last-event-id': lastSeen })
    expect(ids(second)).toEqual(['d', 'e', 'f'])
    expect(new Set([...ids(first), ...ids(second)]).size).toBe(6)
  })

  it('can follow one case only', async () => {
    store.ingest([event('x1', 'CASE-2'), event('y1', 'CASE-3'), event('x2', 'CASE-2')])
    const messages = await read('/stream?after=0&correlationId=corr-CASE-2', 2)
    expect(ids(messages)).toEqual(['x1', 'x2'])
  })

  it('does not lose an event stored while the backlog is being replayed', async () => {
    const before = store.latestSequence()
    const reading = read(`/stream?after=${before}`, 50)
    store.ingest(Array.from({ length: 50 }, (_unused, index) => event(`burst-${index}`, 'CASE-4')))
    const messages = await reading
    expect(ids(messages)).toEqual(Array.from({ length: 50 }, (_unused, index) => `burst-${index}`))
  })
})
