import { join } from 'node:path'
import { agentSummary, CaseStore, LocalAgentClient } from '@durable-jev/agent-core'
import { agentRouter } from '@durable-jev/agent-transport'
import { agentIdSchema } from '@durable-jev/contracts'
import {
  agentMigrations,
  createLogisticsRuntime,
  loadCaseCatalog,
  RerouteDesk,
  scriptedRerouter,
} from '@durable-jev/logistics'
import { JevJudge, ScriptedJudge, type SemanticJudge } from '@durable-jev/model-providers'
import { createService } from '@durable-jev/service-kit'
import { nvidiaProvider } from '@earendil-works/pi-ai/providers/nvidia'
import { investigationRoutes } from './investigation-routes.js'

const repositoryRoot = new URL('../../../', import.meta.url).pathname
const agentId = agentIdSchema.parse(process.env.AGENT_ID)
const materials = process.env.MATERIALS_DIR ?? join(repositoryRoot, 'eval/materials')
const dataDirectory = process.env.DATA_DIR ?? join(repositoryRoot, 'var/data')
const port = Number(process.env.PORT)

const catalog = loadCaseCatalog(join(materials, 'cases'))
const store = CaseStore.open(join(dataDirectory, `${agentId}.sqlite`), agentMigrations(agentId))
const liveJudge: SemanticJudge | undefined =
  process.env.MODEL_MODE === 'live' ? new JevJudge() : undefined
const { runtime, rulePack, reference } = createLogisticsRuntime({
  agentId,
  materialsDirectory: materials,
  store,
  judgeFor: (shipment) =>
    liveJudge ?? new ScriptedJudge(catalog.get(shipment.caseId)?.scriptedJudgements ?? []),
  now: () => new Date().toISOString(),
})

const service = createService(agentId)
service.app.use(
  '/agent',
  agentRouter(new LocalAgentClient(agentId, runtime, store), () =>
    agentSummary(agentId, rulePack, store),
  ),
)
if (agentId === 'transport-planning') {
  const desk = await RerouteDesk.open({
    cases: store,
    runtime,
    reference,
    storage: join(dataDirectory, `${agentId}.investigations.sqlite`),
    model:
      process.env.MODEL_MODE === 'live'
        ? {
            kind: 'live',
            provider: nvidiaProvider(),
            modelId: process.env.INVESTIGATOR_MODEL ?? 'nvidia/nemotron-3.5-lightning-30b-a3b',
          }
        : { kind: 'scripted', next: scriptedRerouter },
    now: () => new Date().toISOString(),
  })
  service.app.use('/agent/investigations', investigationRoutes(desk))
  desk.resumeInterrupted()
}
await service.listen(port)
