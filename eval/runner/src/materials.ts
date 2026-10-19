import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const materialsDirectory = fileURLToPath(new URL('../../materials/', import.meta.url))

export function readMaterial<T>(fileName: string): T {
  return JSON.parse(readFileSync(join(materialsDirectory, fileName), 'utf8')) as T
}

export type RuleSetFile = {
  ruleSetVersion: string
  policyVersion: string
  reviewStatus: 'draft' | 'reviewed'
  rules: unknown
}

export const loadRuleSetFile = () => readMaterial<RuleSetFile>('rules.json')

export const loadPolicyParameters = () =>
  readMaterial<Record<string, unknown>>('mock-policy-parameters.json')
