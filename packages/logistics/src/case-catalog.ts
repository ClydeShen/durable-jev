import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { type CaseFile, loadCaseFile } from './case-file.js'

export type CaseCatalog = ReadonlyMap<string, CaseFile>

export function loadCaseCatalog(casesDirectory: string): CaseCatalog {
  const files = readdirSync(casesDirectory)
    .filter((name) => name.endsWith('.json'))
    .sort()
  return new Map(
    files.map((name) => {
      const caseFile = loadCaseFile(join(casesDirectory, name))
      return [caseFile.shipment.caseId, caseFile]
    }),
  )
}
