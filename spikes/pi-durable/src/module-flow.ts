import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import {
  JevJudge,
  ScriptedJudge,
  type SemanticJudge,
  type SemanticQuestion,
} from '@durable-jev/model-providers'
import { BACKGROUND_CONTEXT, type Context } from '@earendil-works/chord/context'
import { createModels } from '@earendil-works/pi-ai/models'
import {
  createRegistry,
  defineDoc,
  defineExtension,
  defineTask,
  Harness,
  type TaskId,
} from '@earendil-works/pi-durable'
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node'

const workDirectory = new URL('../var/module/', import.meta.url).pathname
const storagePath = `${workDirectory}cargo-module.sqlite`
const evaluationLogPath = `${workDirectory}evaluation-log.json`
const flowIdPath = `${workDirectory}flow-id.txt`
const context = BACKGROUND_CONTEXT
const mode = process.argv[2] ?? 'start'

type Gate = 'PASS' | 'FAIL' | 'WAITING_HUMAN'
type Decision = 'APPROVED' | 'REJECTED' | 'EXPIRED'

function logEvaluation(ruleId: string, detail: string) {
  const log = existsSync(evaluationLogPath)
    ? JSON.parse(readFileSync(evaluationLogPath, 'utf8'))
    : []
  writeFileSync(evaluationLogPath, JSON.stringify([...log, { mode, ruleId, detail }]))
}

const packagingRiskQuestion: SemanticQuestion = {
  kind: 'choice',
  questionId: 'R18.packagingRisk',
  promptVersion: 'v1',
  text: 'Which risk signal does the inspection note show?',
  options: {
    no_risk: 'No packaging damage or temperature risk is described',
    damaged_packaging: 'Physical damage to packaging is described',
    cold_chain_risk: 'Temperature control appears compromised without physical damage',
  },
}

const judge: SemanticJudge =
  process.env.MODEL_MODE === 'live'
    ? new JevJudge()
    : new ScriptedJudge([
        {
          questionId: packagingRiskQuestion.questionId,
          judgement: { kind: 'choice', choice: 'damaged_packaging' },
        },
      ])

const HumanDecisions = defineDoc<{ decisions: Record<string, Decision> }>({
  kind: 'cargo.human-decisions',
  version: 1,
  scope: 'session',
  initial: () => ({ decisions: {} }),
})

type GateInput = { humanTaskId: string; expiresAt: number }
type GateResult = { humanTaskId: string; decision: Decision }

async function awaitDecision(
  runtime: { watchDoc: Harness['watchDoc']; sleep(until: number, context: Context): Promise<void> },
  input: GateInput,
): Promise<Decision> {
  const watch = await runtime.watchDoc(HumanDecisions, context)
  if (!watch) throw new Error('human decision document is missing')
  const recorded = () => watch.value?.decisions[input.humanTaskId]
  if (recorded()) {
    await watch.stop()
    return recorded() as Decision
  }
  const decided = new Promise<Decision>((resolve) =>
    watch.start(async (value) => {
      const decision = value?.decisions[input.humanTaskId]
      if (decision) resolve(decision)
    }),
  )
  const expired = runtime.sleep(input.expiresAt, context).then(() => 'EXPIRED' as const)
  const decision = await Promise.race([decided, expired])
  await watch.stop()
  return decision
}

const HumanGateTask = defineTask<GateInput, { phase: 'awaitDecision' }, GateResult>({
  name: 'cargo.human-gate',
  version: 1,
  initial: () => ({ phase: 'awaitDecision' }),
  phases: {
    awaitDecision: async (task, runtime) => {
      console.log(`[${mode}] gate ${task.input.humanTaskId} waiting for a human decision`)
      const decision = await awaitDecision(runtime, task.input)
      await runtime.commit(
        () => ({
          status: 'terminal',
          outcome: {
            status: 'completed',
            result: { humanTaskId: task.input.humanTaskId, decision },
          },
        }),
        context,
      )
    },
  },
  abort: async (_task, runtime) => {
    await runtime.commit(() => ({ status: 'terminal', outcome: { status: 'aborted' } }), context)
  },
})

type FlowInput = {
  caseId: string
  cargoWeightGrams: number
  vehicleMaxPayloadGrams: number
  inspectionNote: string
}
type FlowChecks = { R02: Gate; R18: Gate; R18Observed: string }
type FlowState =
  | { phase: 'evaluate' }
  | { phase: 'requestApproval'; checks: FlowChecks }
  | { phase: 'decide'; checks: FlowChecks; gate: TaskId<GateResult> }
type FlowResult = FlowChecks & { R13: Gate; R14: Gate }

const CargoModuleFlow = defineTask<FlowInput, FlowState, FlowResult>({
  name: 'cargo.module-flow',
  version: 1,
  initial: () => ({ phase: 'evaluate' }),
  phases: {
    evaluate: async (task, runtime) => {
      const R02: Gate =
        task.input.cargoWeightGrams <= task.input.vehicleMaxPayloadGrams ? 'PASS' : 'FAIL'
      logEvaluation('R02', `code: ${R02}`)
      const answer = await judge.ask(packagingRiskQuestion, {
        inspectionNote: task.input.inspectionNote,
      })
      const observed = answer.judgement.kind === 'choice' ? answer.judgement.choice : 'unexpected'
      logEvaluation('R18', `${answer.provider}/${answer.modelId}: ${observed}`)
      const R18: Gate = observed === 'no_risk' ? 'PASS' : 'WAITING_HUMAN'
      console.log(`[${mode}] evaluated R02=${R02} R18 observed=${observed} gate=${R18}`)
      await runtime.commit(
        () => ({
          status: 'running',
          checkpoint: { phase: 'requestApproval', checks: { R02, R18, R18Observed: observed } },
        }),
        context,
      )
    },
    requestApproval: async (task, runtime) => {
      await runtime.commit(async (tx) => {
        await tx.doc(HumanDecisions)
        const gate = await tx.createTask(
          HumanGateTask,
          { humanTaskId: `${task.input.caseId}:R13`, expiresAt: runtime.now() + 60 * 60 * 1000 },
          { ownership: { kind: 'task', taskId: task.id } },
        )
        return {
          status: 'waiting',
          checkpoint: { phase: 'decide', checks: task.state.checkpoint.checks, gate },
          on: [gate],
          policy: 'allSettled',
        }
      }, context)
    },
    decide: async (task, runtime) => {
      const [gateOutcome] = await runtime.outcomes([task.state.checkpoint.gate], context)
      const decision = gateOutcome?.status === 'completed' ? gateOutcome.result.decision : 'EXPIRED'
      const R13: Gate = decision === 'APPROVED' ? 'PASS' : 'FAIL'
      const { checks } = task.state.checkpoint
      const R14: Gate = [checks.R02, R13].every((gate) => gate === 'PASS') ? 'PASS' : 'FAIL'
      await runtime.commit(
        () => ({
          status: 'terminal',
          outcome: { status: 'completed', result: { ...checks, R13, R14 } },
        }),
        context,
      )
    },
  },
  abort: async (_task, runtime) => {
    await runtime.commit(() => ({ status: 'terminal', outcome: { status: 'aborted' } }), context)
  },
})

const cargoModule = defineExtension({
  name: 'cargo-module',
  tasks: [HumanGateTask, CargoModuleFlow],
})

mkdirSync(workDirectory, { recursive: true })
const registry = createRegistry()
registry.install(cargoModule)
const harness = await Harness.open(
  await openNodeSqliteStorage(storagePath),
  { models: createModels(), registry },
  context,
)
const root = await harness.root(context)

async function waitUntilGateIsWaiting() {
  for (;;) {
    const graph = await harness.taskGraph(context)
    const nodes = Object.values(graph.value.tasks)
    graph.dispose?.()
    const gate = nodes.find(
      (node) => node.kind === 'cargo.human-gate' && node.state.status === 'running',
    )
    if (gate) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

async function waitUntilTerminal<R>(id: TaskId<R>) {
  for (;;) {
    const record = await harness.waitForTask(id, context)
    if (record.state.status === 'terminal') return record
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

if (mode === 'start') {
  const flowId = await root.commit(
    (tx) =>
      tx.createTask(
        CargoModuleFlow,
        {
          caseId: 'LOG-002',
          cargoWeightGrams: 640_000,
          vehicleMaxPayloadGrams: 12_000_000,
          inspectionNote: 'Outer carton crushed on one corner, condensation inside.',
        },
        { ownership: { kind: 'conversation' }, background: true },
      ),
    context,
  )
  writeFileSync(flowIdPath, String(flowId))
  harness.resume()
  await waitUntilGateIsWaiting()
  console.log(`[${mode}] crashing while the module waits for the compliance reviewer`)
  process.exit(137)
}

const flowId = Number(readFileSync(flowIdPath, 'utf8')) as TaskId<FlowResult>
harness.resume()

if (mode === 'restart') {
  await waitUntilGateIsWaiting()
  const flow = await harness.getTask(flowId, context)
  console.log(
    `[${mode}] flow after restart: ${flow?.state.status}, checkpoint ${JSON.stringify(flow?.state.checkpoint)}`,
  )
  console.log(`[${mode}] crashing again while still waiting`)
  process.exit(137)
}

if (mode === 'approve') {
  await waitUntilGateIsWaiting()
  await harness.commit(async (tx) => {
    ;(await tx.doc(HumanDecisions)).decisions['LOG-002:R13'] = 'APPROVED'
  }, context)
  console.log(`[${mode}] compliance reviewer approved LOG-002:R13`)
  const settled = await waitUntilTerminal(flowId)
  console.log(`[${mode}] flow ${settled.state.status}: ${JSON.stringify(settled.state.outcome)}`)
  console.log(`[${mode}] evaluation log: ${readFileSync(evaluationLogPath, 'utf8')}`)
  await harness.close(context)
}
