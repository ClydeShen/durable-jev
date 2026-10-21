import { createHash } from 'node:crypto'
import { canonicalJson } from '@durable-jev/contracts'

export interface FingerprintInput {
  ruleId: string
  ruleVersion: string
  scopeKey: string
  inputs: Record<string, unknown>
  entityVersions: Record<string, number | string | undefined>
  upstream: Record<string, string[]>
}

export function ruleInputFingerprint(input: FingerprintInput): string {
  return createHash('sha256').update(canonicalJson(input)).digest('hex').slice(0, 32)
}
