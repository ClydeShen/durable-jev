import { z } from 'zod'
import { caseIdSchema, correlationIdSchema, revisionSchema } from './ids.js'

export const businessCaseSchema = z
  .object({
    caseId: caseIdSchema,
    correlationId: correlationIdSchema,
    caseRevision: revisionSchema,
    entityVersions: z.record(z.string().min(1), revisionSchema),
  })
  .passthrough()
export type BusinessCase = z.infer<typeof businessCaseSchema>
