import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RuleSet } from '@durable-jev/rule-engine'
import { afterEach, describe, expect, it } from 'vitest'
import { loadLogisticsRulePack } from './logistics-runtime.js'

const materials = fileURLToPath(new URL('../../../eval/materials/', import.meta.url))
const copies: string[] = []

afterEach(() => {
  for (const directory of copies.splice(0)) rmSync(directory, { recursive: true })
})

function candidate(change: (rules: RuleSet) => void): string {
  const directory = mkdtempSync(join(tmpdir(), 'durable-jev-rule-constraints-'))
  copies.push(directory)
  cpSync(materials, directory, { recursive: true })
  const rulesPath = join(directory, 'rules.json')
  const document = JSON.parse(readFileSync(rulesPath, 'utf8')) as RuleSet
  change(document)
  writeFileSync(rulesPath, JSON.stringify(document))
  return directory
}

describe('logistics rule constraints', () => {
  it('rejects an unsupported selection dimension rather than discarding it', () => {
    const directory = candidate((document) => {
      const rule = document.rules.find((entry) => entry.applicability)
      if (!rule) throw new Error('missing extension rule')
      rule.applicability = { ...rule.applicability, riskLevels: ['high'] }
    })
    expect(() => loadLogisticsRulePack(directory)).toThrow('UNKNOWN_APPLICABILITY')
  })

  it('continues to require applicability for logistics extension rules', () => {
    const directory = candidate((document) => {
      const rule = document.rules.find((entry) => entry.applicability)
      if (!rule) throw new Error('missing extension rule')
      rule.applicability = {}
    })
    expect(() => loadLogisticsRulePack(directory)).toThrow('MISSING_APPLICABILITY')
  })

  it('continues to require a complete matrix for the logistics categories', () => {
    const directory = candidate((document) => {
      document.mixingMatrix.pop()
    })
    expect(() => loadLogisticsRulePack(directory)).toThrow('MIXING_INCOMPLETE')
  })

  it('rejects a category outside the logistics vocabulary', () => {
    const directory = candidate((document) => {
      document.mixingMatrix.push({ categories: ['motor', 'motor'], outcome: 'allowed' })
    })
    expect(() => loadLogisticsRulePack(directory)).toThrow('MIXING_CATEGORY')
  })
})
