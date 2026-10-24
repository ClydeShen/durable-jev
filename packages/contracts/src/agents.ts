import { z } from 'zod'

export const agentIdSchema = z.string().regex(/^[a-z][a-z0-9-]*$/)
export type AgentId = z.infer<typeof agentIdSchema>
