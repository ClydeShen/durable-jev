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

/** Orders entered in the console carry their sample's id: LOG-001-N2 is the second from LOG-001. */
const newOrderSuffix = /-N\d+$/

/** The case file behind a case: its own, or for an order entered in the console, its sample's. */
export function caseFileOf(catalog: CaseCatalog, caseId: string): CaseFile | undefined {
  return catalog.get(caseId.replace(newOrderSuffix, ''))
}

/** The id for the next order entered in the console from the given sample. */
export function newOrderId(sampleId: string, taken: readonly string[]): string {
  let number = 1
  while (taken.includes(`${sampleId}-N${number}`)) number += 1
  return `${sampleId}-N${number}`
}
