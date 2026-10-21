import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import { Type } from '@earendil-works/pi-ai'
import { createModels } from '@earendil-works/pi-ai/models'
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux'
import {
  createRegistry,
  defineExtension,
  defineTool,
  Harness,
  hook,
  ToolTask,
} from '@earendil-works/pi-durable'
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node'

const workDirectory = new URL('../var/', import.meta.url).pathname
const storagePath = `${workDirectory}harness.sqlite`
const businessLedgerPath = `${workDirectory}business-ledger.json`
const context = BACKGROUND_CONTEXT
const phase = process.argv[2] ?? 'start'
const investigationRequestId = 'case-1:r1:investigate'

type LedgerRecord = { operationId: string; legId: string }

const readLedger = (): LedgerRecord[] => {
  if (!existsSync(businessLedgerPath)) return []
  return JSON.parse(readFileSync(businessLedgerPath, 'utf8'))
}

const recordReservationOnce = (record: LedgerRecord): 'created' | 'duplicate' => {
  const ledger = readLedger()
  if (ledger.some((existing) => existing.operationId === record.operationId)) return 'duplicate'
  writeFileSync(businessLedgerPath, JSON.stringify([...ledger, record]))
  return 'created'
}

const reservationOperationId = (legId: string): string => {
  return `case-1:r1:reserve_transport:${legId}`
}

const getVehicle = defineTool({
  name: 'get_vehicle',
  description: 'Read vehicle capabilities',
  parameters: Type.Object({ vehicleId: Type.String() }),
  replay: 'safe',
  execute: async (args) => ({
    output: [{ type: 'text', text: `${args.vehicleId}: reefer, 2-8C, 12000kg` }],
  }),
})

const reserveTransport = defineTool({
  name: 'reserve_transport',
  description: 'Reserve simulated capacity for a confirmed plan leg',
  parameters: Type.Object({ legId: Type.String() }),
  execute: async (args) => {
    const outcome = recordReservationOnce({
      operationId: reservationOperationId(args.legId),
      legId: args.legId,
    })
    if (phase === 'start') {
      console.log(`[start] reservation ${outcome}; crashing before tool result is committed`)
      process.exit(137)
    }
    return { output: [{ type: 'text', text: `reservation ${outcome}` }] }
  },
})

const getOperationStatus = defineTool({
  name: 'get_operation_status',
  description: 'Check whether a business side effect was already applied',
  parameters: Type.Object({ legId: Type.String() }),
  replay: 'safe',
  execute: async (args) => {
    const applied = readLedger().some(
      (record) => record.operationId === reservationOperationId(args.legId),
    )
    return { output: [{ type: 'text', text: applied ? 'applied' : 'not_applied' }] }
  },
})

const approveCompliance = defineTool({
  name: 'approve_compliance',
  description: 'Human-only compliance approval',
  parameters: Type.Object({ caseId: Type.String() }),
  execute: async () => ({ output: [{ type: 'text', text: 'approved' }] }),
})

const humanOnlyTools = new Set(['approve_compliance'])

const runtimeControls = defineExtension({
  name: 'runtime-controls',
  tools: [getVehicle, reserveTransport, getOperationStatus, approveCompliance],
  hooks: [
    hook(ToolTask, {
      beforeTool: (call) =>
        humanOnlyTools.has(call.name) ? { block: `${call.name} requires a human role` } : undefined,
    }),
  ],
})

const callsTools = { stopReason: 'toolUse' } as const
const scriptedModel = fauxProvider({ provider: 'scripted', models: [{ id: 'investigator' }] })

if (phase === 'start') {
  scriptedModel.setResponses([
    fauxAssistantMessage(
      [
        fauxToolCall('get_vehicle', { vehicleId: 'VEH-7' }),
        fauxToolCall('approve_compliance', { caseId: 'case-1' }),
      ],
      callsTools,
    ),
    fauxAssistantMessage(fauxToolCall('reserve_transport', { legId: 'LEG-1' }), callsTools),
  ])
} else {
  scriptedModel.setResponses([
    fauxAssistantMessage(fauxToolCall('get_operation_status', { legId: 'LEG-1' }), callsTools),
    fauxAssistantMessage(fauxText('Reservation confirmed as already applied; investigation done.')),
  ])
}

if (phase === 'start') {
  rmSync(workDirectory, { recursive: true, force: true })
  mkdirSync(workDirectory, { recursive: true })
}

const models = createModels()
models.setProvider(scriptedModel.provider)
const registry = createRegistry()
registry.install(runtimeControls)

const harness = await Harness.open(
  await openNodeSqliteStorage(storagePath),
  { models, registry, settings: { toolExecution: 'sequential' } },
  context,
)
const root = await harness.root(context, {
  agent: { model: { provider: 'scripted', modelId: 'investigator' } },
})

const submission = await root.submit(
  { type: 'input', content: 'Investigate LEG-1 and reserve it', requestId: investigationRequestId },
  context,
)
console.log(`[${phase}] submission ${submission.id}`)
const settled = await submission.wait(context)
console.log(`[${phase}] settled: ${settled.status}`)

const transcript = await root.entries({}, 100, undefined, context)
for (const entry of transcript.items.reverse()) {
  console.log(`  ${JSON.stringify(entry).slice(0, 400)}`)
}
console.log(`[${phase}] business ledger: ${JSON.stringify(readLedger())}`)
console.log(`[${phase}] usage: ${JSON.stringify(await harness.usage(context))}`)
await harness.close(context)
