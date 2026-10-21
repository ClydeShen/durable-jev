// One investigation process for the crash tests: `start` submits, `resume` continues after a
// kill. CRASH_AT=<tool>:<n> kills the process inside the n-th call of that tool, before Pi
// commits its result, like a power cut in the middle of a call.
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ContextAssembler,
  defineTool,
  InMemoryAgentRuntime,
  ToolRegistry,
} from '@durable-jev/agent-harness'
import { PiDurableAgentRuntime, piRuntimeMigrations } from '@durable-jev/agent-runtime-pi'
import { openDatabase } from '@durable-jev/store'
import { initTracing, Telemetry } from '@durable-jev/telemetry'
import { describeInvestigation, investigatorInstructions } from './investigation.runtime.js'
import {
  type InvestigationRequest,
  investigationTools,
  resultToolName,
} from './investigation.tools.js'
import { logFourDependencies } from './log-four.fixture.js'
import { ScriptedInvestigatorModel } from './scripted-investigator.model.js'

const [workDirectory = '.', phase = 'start'] = process.argv.slice(2)
const [crashTool, crashAtCall] = (process.env.CRASH_AT ?? '').split(':')
const executionLog = join(workDirectory, 'executions.log')
const callsThisProcess = new Map<string, number>()

const registry = new ToolRegistry()
for (const tool of investigationTools(logFourDependencies).toolsFor('agent')) {
  registry.register(
    defineTool({
      ...tool,
      execute: async (input, context) => {
        appendFileSync(executionLog, `${tool.name}\n`)
        const calls = (callsThisProcess.get(tool.name) ?? 0) + 1
        callsThisProcess.set(tool.name, calls)
        if (tool.name === crashTool && calls === Number(crashAtCall)) process.exit(137)
        const result = await tool.execute(input, context)
        // `<tool>:done` marks a call that really ran to its end, as opposed to an attempt.
        appendFileSync(executionLog, `${tool.name}:done\n`)
        return result
      },
    }),
  )
}

const stateDatabase = openDatabase(join(workDirectory, 'runs.sqlite'), piRuntimeMigrations)
const telemetry = new Telemetry('investigator', stateDatabase)
initTracing(telemetry)

const runOptions = {
  registry,
  model: new ScriptedInvestigatorModel(logFourDependencies.request.legId),
  assembler: new ContextAssembler(investigatorInstructions),
  describe: describeInvestigation,
  resultTool: resultToolName,
}
// RUNTIME=memory is the benchmark's control group: the same loop and tools without persisted
// execution state, so after a crash the only way forward is to submit the request again.
const inMemory = process.env.RUNTIME === 'memory'
const runtime = inMemory
  ? new InMemoryAgentRuntime<InvestigationRequest>(runOptions)
  : new PiDurableAgentRuntime<InvestigationRequest>({
      ...runOptions,
      storagePath: join(workDirectory, 'pi.sqlite'),
      stateDatabase,
      telemetry,
    })
const session = await runtime.open({
  caseId: logFourDependencies.investigated.caseId,
  caseRevision: 1,
  purpose: 'replace-carrier',
})
const submitAgain = () => session.submit({ requestId: 'inv-1', input: logFourDependencies.request })
const handle =
  phase === 'start'
    ? await submitAgain()
    : ((await session.resume()) ?? (inMemory ? await submitAgain() : undefined))
const outcome = handle ? await handle.outcome : undefined
await session.close()
console.log(JSON.stringify({ outcome, events: session.events() }))
