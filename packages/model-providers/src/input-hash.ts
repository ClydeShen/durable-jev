import { createHash } from 'node:crypto'
import { canonicalJson } from '@durable-jev/contracts'
import type { SemanticQuestion, SemanticState } from './semantic-judge.js'

export function semanticInputHash(question: SemanticQuestion, state: SemanticState): string {
  return createHash('sha256').update(canonicalJson({ question, state })).digest('hex')
}
