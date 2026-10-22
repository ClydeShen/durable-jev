import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  agentSummary,
  CaseOrchestrator,
  CaseStore,
  LocalAgentClient,
} from '@durable-jev/agent-core'
import { A2aAgentClient, a2aRoutes, agentCard, HttpAgentClient } from '@durable-jev/agent-transport'
import { type AgentId, agentIdSchema } from '@durable-jev/contracts'
import { agentProfiles, createLogisticsRuntime, loadCaseCatalog } from '@durable-jev/logistics'
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
const transport = process.env.AGENT_TRANSPORT === 'a2a' ? 'a2a' : 'native'
const a2aTasks = new Map<AgentId, number>()
const remotes = [...endpoints].map(([agentId, url]) => {
  const native = new HttpAgentClient(agentId, url)
  const business =
    transport === 'a2a'
      ? new A2aAgentClient(agentId, url, native, (task) =>
          a2aTasks.set(task.agentId, (a2aTasks.get(task.agentId) ?? 0) + 1),
        )
      : native
  return { agentId, url, native, business }
})
const transportUrl = endpoints.get('transport-planning')
if (!transportUrl) throw new Error('AGENT_ENDPOINTS must include transport-planning')
const coordinationClient = new LocalAgentClient('order-coordination', runtime, store)
const agents = [coordinationClient, ...remotes.map((remote) => remote.business)]
const eventLog = EventLog.open(join(dataDirectory, 'observability.sqlite'))
const orchestrator = new CaseOrchestrator(
  agents,
  rulePack.ruleSet,
  (caseId) => store.caseRecord(caseId)?.shipment,
)

const coordinationSummary = () => agentSummary('order-coordination', rulePack, store)

async function cardOf(url: string): Promise<AgentStatus['card']> {
  const card = (await (await fetch(`${url}/.well-known/agent-card.json`)).json()) as {
    name: string
    description: string
  }
  return { name: card.name, description: card.description, url }
}

async function agentStatuses(): Promise<AgentStatus[]> {
  const local: AgentStatus = {
    agentId: 'order-coordination',
    available: true,
    summary: coordinationSummary(),
    card: { ...agentProfiles['order-coordination'], url: `http://localhost:${port}` },
    transport,
    a2aTasks: 0,
  }
  const others = await Promise.all(
    remotes.map(({ agentId, url, native }) =>
      Promise.all([native.summary(), cardOf(url)]).then(
        ([summary, card]): AgentStatus => ({
          agentId,
          available: true,
          summary,
          card,
          transport,
          a2aTasks: a2aTasks.get(agentId) ?? 0,
        }),
        (): AgentStatus => ({
          agentId,
          available: false,
          card: { ...agentProfiles[agentId], url },
          transport,
          a2aTasks: 0,
        }),
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
  a2aRoutes(
    coordinationClient,
    agentCard(
      agentProfiles['order-coordination'],
      `http://localhost:${port}`,
      coordinationSummary().rulePackVersion,
    ),
  ),
)
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
