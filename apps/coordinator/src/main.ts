import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  agentSummary,
  CaseOrchestrator,
  CaseStore,
  LocalAgentClient,
} from '@durable-jev/agent-core'
import {
  A2aAgentClient,
  a2aRoutes,
  agentCard,
  forgetRequests,
  HttpAgentClient,
} from '@durable-jev/agent-transport'
import { type AgentId, type OrderOptions, shipmentSchema } from '@durable-jev/contracts'
import {
  agentProfiles,
  createLogisticsRuntime,
  loadCaseCatalog,
  logisticsAgentIdSchema,
  scriptedJudgementsOf,
} from '@durable-jev/logistics'
import { JevJudge, ScriptedJudge, type SemanticJudge } from '@durable-jev/model-providers'
import { createService, HttpError } from '@durable-jev/service-kit'
import express from 'express'
import { watchAgents } from './agent-watch.js'
import { collectEvents, EventLog } from './event-log.js'
import { InvestigationClient } from './investigation-client.js'
import { OrderBook } from './order-book.js'
import { type AgentStatus, coordinatorRoutes } from './routes.js'

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url))
const materials = process.env.MATERIALS_DIR ?? join(repositoryRoot, 'eval/materials')
const dataDirectory = process.env.DATA_DIR ?? join(repositoryRoot, 'var/data')
const webDist = process.env.WEB_DIST ?? join(repositoryRoot, 'apps/web/dist')
const port = Number(process.env.PORT ?? 4100)
const now = () => new Date().toISOString()

function agentEndpoints(setting: string | undefined): Map<AgentId, string> {
  if (!setting) throw new Error('AGENT_ENDPOINTS is required; start the demo with pnpm start')
  return new Map(
    setting.split(',').map((entry) => {
      const [agentId, url] = entry.split('=')
      return [logisticsAgentIdSchema.parse(agentId), url ?? '']
    }),
  )
}

const catalog = loadCaseCatalog(join(materials, 'cases'))
const store = CaseStore.open(join(dataDirectory, 'order-coordination.sqlite'), shipmentSchema.parse)
const liveJudge: SemanticJudge | undefined =
  process.env.MODEL_MODE === 'live' ? new JevJudge() : undefined
const { runtime, rulePack, reference } = createLogisticsRuntime({
  agentId: 'order-coordination',
  materialsDirectory: materials,
  store,
  judgeFor: (shipment) =>
    liveJudge ?? new ScriptedJudge(scriptedJudgementsOf(catalog, shipment.caseId)),
  now,
})
const orderOptions: OrderOptions = {
  customers: [...reference.customers.values()].map((customer) => ({
    customerId: customer.customerId,
    name: customer.name,
    restrictions: customer.restrictionsText,
  })),
  carriers: [...reference.carriers.values()].map(({ carrierId, name }) => ({ carrierId, name })),
  vehicles: [...reference.vehicles.values()].map(
    ({ vehicleId, carrierId, temperatureControlled }) => ({
      vehicleId,
      carrierId,
      temperatureControlled,
    }),
  ),
  locations: [...reference.locations.keys()],
}
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
const orderBook = OrderBook.open(join(dataDirectory, 'orders.sqlite'))
const orchestrator = new CaseOrchestrator(
  agents,
  rulePack.ruleSet,
  (caseId) => store.caseRecord(caseId)?.data,
)

const coordinationSummary = () => agentSummary('order-coordination', rulePack, store)

async function cardOf(url: string): Promise<AgentStatus['card']> {
  const card = (await (await fetch(`${url}/.well-known/agent-card.json`)).json()) as {
    name: string
    description: string
  }
  return { name: card.name, description: card.description, url }
}

/** An agent's full A2A Agent Card, as any A2A client discovers it. */
async function agentCardOf(agentId: string): Promise<unknown> {
  const url =
    agentId === 'order-coordination'
      ? `http://localhost:${port}`
      : [...endpoints].find(([id]) => id === agentId)?.[1]
  if (!url) throw new HttpError(404, `no agent ${agentId}`)
  try {
    return await (await fetch(`${url}/.well-known/agent-card.json`)).json()
  } catch {
    throw new HttpError(503, `${agentId} is offline; restart it to read its Agent Card`)
  }
}

async function agentStatuses(): Promise<AgentStatus[]> {
  const local: AgentStatus = {
    agentId: 'order-coordination',
    available: true,
    summary: coordinationSummary(),
    card: { ...agentProfiles['order-coordination'], url: `http://localhost:${port}` },
    responsibilities: agentProfiles['order-coordination'].responsibilities,
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
          responsibilities: agentProfiles[logisticsAgentIdSchema.parse(agentId)].responsibilities,
          transport,
          a2aTasks: a2aTasks.get(agentId) ?? 0,
        }),
        (): AgentStatus => ({
          agentId,
          available: false,
          card: { ...agentProfiles[logisticsAgentIdSchema.parse(agentId)], url },
          responsibilities: agentProfiles[logisticsAgentIdSchema.parse(agentId)].responsibilities,
          transport,
          a2aTasks: 0,
        }),
      ),
    ),
  )
  return [local, ...others]
}

const controlUrl = process.env.CONTROL_URL

/** A reset needs every agent: under the launcher, start the ones the presenter stopped. */
async function startStoppedAgents() {
  const stopped = (await agentStatuses()).filter((status) => !status.available)
  if (stopped.length === 0) return
  if (controlUrl) {
    for (const { agentId } of stopped)
      await fetch(`${controlUrl}/services/${agentId}/start`, { method: 'POST' })
  }
  await waitForAgents()
}

async function resetDemo() {
  await startStoppedAgents()
  await orchestrator.reset()
  forgetRequests(coordinationClient)
  eventLog.clear()
  orderBook.clear()
  for (const caseFile of catalog.values()) await orchestrator.submit(caseFile.shipment)
}

async function resetCase(caseId: string) {
  const original = orderBook.original(caseId) ?? catalog.get(caseId)?.shipment
  if (!original) throw new HttpError(404, `${caseId} has no original order to start over from`)
  await startStoppedAgents()
  await orchestrator.reset(caseId)
  forgetRequests(coordinationClient, caseId)
  eventLog.clear(caseId)
  await orchestrator.submit(original)
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
    orderOptions,
    rulePack,
    investigations: new InvestigationClient(transportUrl),
    agentStatuses,
    agentCardOf,
    controlUrl,
    timeline: (caseId) => eventLog.timeline(caseId),
    now,
    recordOrder: (shipment) => orderBook.put(shipment),
    resetDemo,
    resetCase,
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
