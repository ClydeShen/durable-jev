import { join } from 'node:path'
import { a2aRoutes, agentCard } from '@durable-jev/a2a-adapter'
import { agentSummary, CaseStore, LocalAgentClient } from '@durable-jev/agent-core'
import { agentRouter } from '@durable-jev/agent-transport'
import { agentIdSchema } from '@durable-jev/contracts'
import {
  agentMigrations,
  agentProfiles,
  createLogisticsRuntime,
  loadCaseCatalog,
  RerouteDesk,
  rerouterModel,
} from '@durable-jev/logistics'
import { JevJudge, ScriptedJudge, type SemanticJudge } from '@durable-jev/model-providers'
import { createService } from '@durable-jev/service-kit'
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
const client = new LocalAgentClient(agentId, runtime, store)
const summary = () => agentSummary(agentId, rulePack, store)
service.app.use('/agent', agentRouter(client, summary))
service.app.use(
  a2aRoutes(
    client,
    agentCard(agentProfiles[agentId], `http://localhost:${port}`, summary().rulePackVersion),
  ),
)
if (agentId === 'transport-planning') {
  const desk = await RerouteDesk.open({
    cases: store,
    runtime,
    reference,
    storage: join(dataDirectory, `${agentId}.investigations.sqlite`),
    model: rerouterModel(),
    now: () => new Date().toISOString(),
  })
  service.app.use('/agent/investigations', investigationRoutes(desk))
  desk.resumeInterrupted()
}
await service.listen(port)
