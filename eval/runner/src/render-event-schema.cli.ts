import { eventSchemaPath, writeEventSchema } from './event-schema.helpers.js'

writeEventSchema()
console.log(`wrote ${eventSchemaPath}`)
