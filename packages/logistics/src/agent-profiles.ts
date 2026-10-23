import type { AgentId } from '@durable-jev/contracts'

interface AgentProfile {
  name: string
  description: string
  /** What the agent does, one responsibility per entry, for its card in the console. */
  responsibilities: string[]
}

/** What each Durable Jev Agent is responsible for; published in its Agent Card. */
export const agentProfiles: Record<AgentId, AgentProfile> = {
  'order-coordination': {
    name: 'Order coordination',
    description: "Takes the order, gathers every agent's results, releases and confirms dispatch",
    responsibilities: [
      'Takes the order and hands every revision to the other four agents',
      "Passes the agents' results between them until nothing changes",
      'Arranges warehouse loading and decides whether the whole order may be released (R40)',
      'When the dispatcher confirms, checks release and the revision again in one transaction',
    ],
  },
  'cargo-assurance': {
    name: 'Cargo assurance',
    description:
      'Cargo classification, controlled and cold-chain checks, documents, repack and retest',
    responsibilities: [
      'Decides whether each item is general, cold-chain or controlled cargo',
      'Controlled cargo: complete documents, documents matching the goods, carrier qualification, mixing',
      'Cold-chain cargo: temperature logs, repair and retest after a temperature deviation',
      'Runs the two-step sign-off by a compliance and a quality reviewer, never the same person twice',
    ],
  },
  'transport-planning': {
    name: 'Transport planning',
    description:
      'Route, vehicle, carrier, transfer hubs and capacity booking; an investigation helper finds a replacement when a carrier cancels',
    responsibilities: [
      'Checks leg sequence, vehicle payload, carrier qualification and transfer hub capability',
      'Books capacity (R29, the only one of 150 rules written as code)',
      'When a carrier cancels, starts the investigation helper: it searches spare capacity, pre-checks the rules for each offer and proposes a reroute',
      'Only the transport planner confirms a reroute; the helper proposes, it never decides',
    ],
  },
  'commercial-control': {
    name: 'Commercial control',
    description: 'Credit, quote, extra cost and customer contract terms',
    responsibilities: [
      'Checks customer status and credit; over the limit, a commercial manager approves',
      'Checks the quote; extra cost above the threshold goes to a commercial manager',
      'Checks each customer contract term (policy schedule H)',
    ],
  },
  'destination-compliance': {
    name: 'Destination compliance',
    description: 'Destination import requirements (extension)',
    responsibilities: [
      'Jev decides which commodity groups each item belongs to; when unsure it picks several rather than miss one',
      'Selects the import requirements that apply to this order by destination and commodity group (policy schedule G); the rest are filtered out',
      "Added as the extension: adding this agent changed no other agent's code",
    ],
  },
}
