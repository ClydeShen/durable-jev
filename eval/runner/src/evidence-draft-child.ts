import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CaseStore } from '@durable-jev/agent-core'
import { type ConversationId, DurableInvestigator } from '@durable-jev/agent-harness'
import { shipmentSchema } from '@durable-jev/contracts'
import { evidenceTools } from '@durable-jev/logistics'
import { unpublishedEvents } from '@durable-jev/store'
import { evidenceDraftRequest, evidenceTrial } from './evidence-draft-control.js'
import { writeEvidence } from './experiment-evidence.js'

const [phase, directory = ''] = process.argv.slice(2)
if (!['control', 'interrupt', 'resume'].includes(phase ?? '')) throw new Error('invalid phase')
if (process.env.MODEL_MODE === 'live') throw new Error('recovery control is scripted only')
const plan = JSON.parse(readFileSync(join(directory, 'plan.json'), 'utf8')) as {
  shipment: unknown
  cut: 'control' | 'before-submit' | 'after-write'
}
const shipment = shipmentSchema.parse(plan.shipment)
const scope = {
  caseId: shipment.caseId,
  caseRevision: shipment.caseRevision,
  investigationId: 'evidence-control',
}
const cases = CaseStore.open(join(directory, 'business.sqlite'), shipmentSchema.parse)
if (phase !== 'resume') cases.putCase(shipment, '2026-10-24T00:00:00Z')
const interrupt = () => {
  writeEvidence(join(directory, 'interrupted.json'), { cut: plan.cut, exitCode: 137 })
  process.exit(137)
}
const tools = evidenceTools(cases).map((tool) => ({
  ...tool,
  execute: (args: Parameters<typeof tool.execute>[0], boundScope: typeof scope) => {
    appendFileSync(
      join(directory, 'attempts.jsonl'),
      `${JSON.stringify({ tool: tool.name, args })}\n`,
    )
    if (
      phase === 'interrupt' &&
      plan.cut === 'before-submit' &&
      tool.name === 'submit_evidence_draft'
    )
      interrupt()
    const result = tool.execute(args, boundScope)
    if (
      phase === 'interrupt' &&
      plan.cut === 'after-write' &&
      tool.name === 'submit_evidence_draft'
    )
      interrupt()
    return result
  },
}))
const investigator = await DurableInvestigator.open({
  storage: join(directory, 'pi.sqlite'),
  tools,
  scopeOf: () => scope,
  instructions: evidenceTrial.instructions,
  model: {
    kind: 'scripted',
    next: (results) => {
      appendFileSync(
        join(directory, 'model-steps.jsonl'),
        `${JSON.stringify({ completedTools: results.length })}\n`,
      )
      if (!results.length) return { call: 'read_case_evidence', args: {} }
      if (results.length === 1)
        return {
          call: 'submit_evidence_draft',
          args: evidenceDraftRequest(
            results[0]?.result as Parameters<typeof evidenceDraftRequest>[0],
          ),
        }
      return { answer: JSON.stringify(results) }
    },
  },
})
try {
  const conversationId =
    phase === 'resume'
      ? (JSON.parse(readFileSync(join(directory, 'conversation.json'), 'utf8')) as ConversationId)
      : await investigator.begin()
  if (phase !== 'resume') writeEvidence(join(directory, 'conversation.json'), conversationId)
  const outcome = await investigator.run(conversationId, 'evidence-control', evidenceTrial.task, {})
  writeEvidence(join(directory, 'result.json'), {
    outcome,
    events: unpublishedEvents(cases.db),
    record: cases.caseRecord(scope.caseId),
    tasks: cases.tasksOf(scope.caseId),
    attempts: readFileSync(join(directory, 'attempts.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line)),
    scriptedModelSteps: readFileSync(join(directory, 'model-steps.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line)),
  })
} finally {
  await investigator.close()
  cases.db.close()
}
