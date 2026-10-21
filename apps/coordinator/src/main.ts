import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  agentSummary,
  CaseOrchestrator,
  CaseStore,
  LocalAgentClient,
} from '@durable-jev/agent-core'
import { HttpAgentClient } from '@durable-jev/agent-transport'
import { type AgentId, agentIdSchema } from '@durable-jev/contracts'
import { createLogisticsRuntime, loadCaseCatalog } from '@durable-jev/logistics'
import { JevJudge, ScriptedJudge, type SemanticJudge } from '@durable-jev/model-providers'
import { createService } from '@durable-jev/service-kit'
import express from 'express'
import { watchAgents } from './agent-watch.js'
import { collectEvents, EventLog } from './event-log.js'
import { InvestigationClient } from './investigation-client.js'
import { type AgentStatus, coordinatorRoutes } from './routes.js'

const repositoryRoot = new URL('../../../', import.meta.url).pathname
const materials = process.env.MATERIALS_DIR ?? join(repositoryRoot, 'eval/materials')
const dataDirectory = process.env.DATA_DIR ?? join(repositoryRoot, 'var/data')
const webDist = process.env.WEB_DIST ?? join(repositoryRoot, 'apps/web/dist')
const port = Number(process.env.PORT ?? 4100)
const now = () => new Date().toISOString()

function agentEndpoints(endpoints: string | undefined): Map<AgentId, string> {
  if (!endpoints) throw new Error('AGENT_ENDPOINTS is required; start the demo with pnpm start')
  return new Map(
    endpoints.split(',').map((entry) => {
      const [agentId, url] = entry.split('=')
      return [agentIdSchema.parse(agentId), url ?? '']
    }),
  )
}

const catalog = loadCaseCatalog(join(materials, 'cases'))
const store = CaseStore.open(join(dataDirectory, 'order-coordination.sqlite'))
const liveJudge: SemanticJudge | undefined =
  process.env.MODEL_MODE === 'live' ? new JevJudge() : undefined
const { runtime, rulePack } = createLogisticsRuntime({
  agentId: 'order-coordination',
  materialsDirectory: materials,
  store,
  judgeFor: (shipment) =>
    liveJudge ?? new ScriptedJudge(catalog.get(shipment.caseId)?.scriptedJudgements ?? []),
  now,
})
const endpoints = agentEndpoints(process.env.AGENT_ENDPOINTS)
const remotes = [...endpoints].map(([agentId, url]) => new HttpAgentClient(agentId, url))
const transportUrl = endpoints.get('transport-planning')
if (!transportUrl) throw new Error('AGENT_ENDPOINTS must include transport-planning')
const agents = [new LocalAgentClient('order-coordination', runtime, store), ...remotes]
const eventLog = EventLog.open(join(dataDirectory, 'observability.sqlite'))
const orchestrator = new CaseOrchestrator(
  agents,
  rulePack.ruleSet,
  (caseId) => store.caseRecord(caseId)?.shipment,
)

async function agentStatuses(): Promise<AgentStatus[]> {
  const local: AgentStatus = {
    agentId: 'order-coordination',
    available: true,
    summary: agentSummary('order-coordination', rulePack, store),
  }
  const others = await Promise.all(
    remotes.map((remote) =>
      remote.summary().then(
        (summary): AgentStatus => ({ agentId: remote.agentId, available: true, summary }),
        (): AgentStatus => ({ agentId: remote.agentId, available: false }),
      ),
    ),
  )
  return [local, ...others]
}

async function resetDemo() {
  await orchestrator.reset()
  eventLog.clear()
  for (const caseFile of catalog.values()) await orchestrator.submit(caseFile.shipment)
}

async function waitForAgents(deadline = Date.now() + 30_000) {
  while (!(await agentStatuses()).every((status) => status.available)) {
    if (Date.now() > deadline) throw new Error('agents did not come up within 30s')
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
}

const service = createService('order-coordination')
service.app.use(
  '/api',
  coordinatorRoutes({
    coordination: { runtime, store },
    orchestrator,
    catalog,
    rulePack,
    investigations: new InvestigationClient(transportUrl),
    agentStatuses,
    controlUrl: process.env.CONTROL_URL,
    timeline: (caseId) => eventLog.timeline(caseId),
    now,
    resetDemo,
  }),
)
if (existsSync(webDist)) {
  service.app.use(express.static(webDist))
  service.app.get('/{*path}', (_request, response) =>
    response.sendFile(join(webDist, 'index.html')),
  )
}
await waitForAgents()
if (store.cases().length === 0) await resetDemo()
watchAgents(orchestrator, store)
collectEvents(agents, eventLog)
await service.listen(port)
