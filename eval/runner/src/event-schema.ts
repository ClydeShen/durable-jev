import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ObservabilityEvent } from '@durable-jev/contracts'
import { z } from 'zod'
import { materialsDirectory } from './materials.js'

export const eventSchemaPath = join(materialsDirectory, 'event-schema.json')

// The contract other tools read: generated from the zod schema, never edited by hand.
export const renderEventSchema = (): string =>
  `${JSON.stringify(z.toJSONSchema(ObservabilityEvent), null, 2)}\n`

export const writeEventSchema = () => writeFileSync(eventSchemaPath, renderEventSchema())
