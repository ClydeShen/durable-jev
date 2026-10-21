import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ReferenceData } from '@durable-jev/contracts'
import { CaseFile } from './case-file.schema.js'

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

export const loadReferenceData = () =>
  ReferenceData.parse(readMaterial<unknown>('mock-data/reference-data.json'))

export const listCaseIds = () =>
  readdirSync(join(materialsDirectory, 'cases'))
    .filter((fileName) => fileName.endsWith('.json'))
    .map((fileName) => fileName.replace(/\.json$/, ''))
    .sort()

export const loadCase = (caseName: string) =>
  CaseFile.parse(readMaterial<unknown>(`cases/${caseName}.json`))
