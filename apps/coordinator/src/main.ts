import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { CaseRuntime, CaseStore, loadRulePack } from '@durable-jev/agent-core'
import { buildCaseFacts, loadReferenceData } from '@durable-jev/logistics'
import { JevJudge, ScriptedJudge, type SemanticJudge } from '@durable-jev/model-providers'
import { createService } from '@durable-jev/service-kit'
import { clearData } from '@durable-jev/store'
import express from 'express'
import { loadCaseCatalog } from './case-catalog.js'
import { coordinatorRoutes } from './routes.js'
import { reservationMigrations, reserveTransport } from './transport-reservation.js'

const repositoryRoot = new URL('../../../', import.meta.url).pathname
const materials = process.env.MATERIALS_DIR ?? join(repositoryRoot, 'eval/materials')
const dataDirectory = process.env.DATA_DIR ?? join(repositoryRoot, 'var/data')
const webDist = process.env.WEB_DIST ?? join(repositoryRoot, 'apps/web/dist')
const port = Number(process.env.PORT ?? 4100)
const now = () => new Date().toISOString()

const catalog = loadCaseCatalog(join(materials, 'cases'))
const reference = loadReferenceData(join(materials, 'mock-data'))
const store = CaseStore.open(
  join(dataDirectory, 'order-coordination.sqlite'),
  reservationMigrations,
)
const codeEvaluators = new Map([['R29', reserveTransport(store.db)]])
const rulePack = loadRulePack(materials, new Set(codeEvaluators.keys()))
const liveJudge: SemanticJudge | undefined =
  process.env.MODEL_MODE === 'live' ? new JevJudge() : undefined

const runtime = new CaseRuntime({
  store,
  rulePack,
  codeEvaluators,
  judgeFor: (shipment) =>
    liveJudge ?? new ScriptedJudge(catalog.get(shipment.caseId)?.scriptedJudgements ?? []),
  factsOf: (shipment) => buildCaseFacts(shipment, reference),
  now,
})

async function resetDemo() {
  clearData(store.db)
  for (const caseFile of catalog.values()) await runtime.submit(caseFile.shipment)
}

const service = createService('order-coordination')
service.app.use('/api', coordinatorRoutes({ runtime, store, catalog, rulePack, now, resetDemo }))
if (existsSync(webDist)) {
  service.app.use(express.static(webDist))
  service.app.get('/{*path}', (_request, response) =>
    response.sendFile(join(webDist, 'index.html')),
  )
}
if (store.cases().length === 0) await resetDemo()
await service.listen(port)
