import type { Message, Part } from '@a2a-js/sdk'

/** Business capabilities every Durable Jev Agent offers over A2A. */
export const caseSkills = {
  'submit-case': {
    name: 'Submit a case',
    description: 'Take a new shipment revision and evaluate the rules this agent owns',
  },
  'evaluate-case': {
    name: 'Evaluate a case',
    description: "Re-evaluate a case with other agents' latest rule outcomes",
  },
  'case-state': {
    name: 'Report case state',
    description: "Report this agent's rule outcomes and human tasks for a case",
  },
  'decide-task': {
    name: 'Decide a task',
    description: 'Record a human decision on a task this agent owns',
  },
  'open-tasks': {
    name: 'List open tasks',
    description: 'List the open human tasks this agent owns',
  },
} as const

export type CaseSkill = keyof typeof caseSkills

/** The data part of a skill request; `requestKey` marks a request that may be retried safely. */
export interface SkillRequest {
  skill: CaseSkill
  requestKey?: string
  input: unknown
}

export function dataPart(value: unknown): Part {
  return {
    content: { $case: 'data', value },
    metadata: undefined,
    filename: '',
    mediaType: 'application/json',
  }
}

export function textPart(value: string): Part {
  return {
    content: { $case: 'text', value },
    metadata: undefined,
    filename: '',
    mediaType: 'text/plain',
  }
}

export function dataOf(parts: readonly Part[]): unknown {
  return parts.find((part) => part.content?.$case === 'data')?.content?.value
}

export function textOf(message: Message | undefined): string {
  return (message?.parts ?? [])
    .flatMap((part) => (part.content?.$case === 'text' ? [part.content.value] : []))
    .join('')
}
