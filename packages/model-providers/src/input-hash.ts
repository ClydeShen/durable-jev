import { createHash } from 'node:crypto'
import type { SemanticQuestion, SemanticState } from './semantic-judge.js'

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function semanticInputHash(question: SemanticQuestion, state: SemanticState): string {
  return createHash('sha256').update(canonicalJson({ question, state })).digest('hex')
}
