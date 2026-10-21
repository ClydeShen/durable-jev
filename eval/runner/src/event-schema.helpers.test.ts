import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { eventSchemaPath, renderEventSchema } from './event-schema.helpers.js'

describe('event-schema.json', () => {
  it('is up to date with the ObservabilityEvent schema', () => {
    expect(readFileSync(eventSchemaPath, 'utf8')).toBe(renderEventSchema())
  })
})
