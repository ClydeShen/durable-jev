import { z } from 'zod'

export const agentIdSchema = z.enum([
  'order-coordination',
  'cargo-assurance',
  'transport-planning',
  'commercial-control',
  'destination-compliance',
])
