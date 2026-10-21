import { join } from 'node:path'
import type { OutboxEventDraft } from '@durable-jev/store'
import { actor, caseFile, FaultLab } from './lab.js'

/**
 * Runs one side of a crash scenario in its own process: the `start` phase exits with code 137 at
 * the injection point, the `resume` phase reopens the same files and prints what it finds.
 */
const [phase = '', directory = ''] = process.argv.slice(2)
const crash = () => process.exit(137)
const report = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`)

async function crashDuringInvestigation(resume: boolean) {
  const lab = new FaultLab('LOG-004', { dataDirectory: directory })
  if (!resume) await lab.submit()
  const { store } = lab.agents.transport
  if (!resume) {
    const record = store.record.bind(store)
    store.record = (event: OutboxEventDraft) => {
      record(event)
      const payload = event.payload as { tool?: string }
      if (event.eventName === 'investigation.tool_called' && payload.tool === 'check_plan') crash()
    }
  }
  const desk = await lab.openDesk({ storage: join(directory, 'investigations.sqlite') })
  if (!resume) {
    await desk.report('LOG-004', { type: 'carrierCancelled', legId: 'LEG-1' })
    await new Promise(() => {})
  }
  desk.resumeInterrupted()
  const [investigation] = desk.ofCase('LOG-004')
  const settled = await desk.settled(investigation?.investigationId ?? '')
  const tools = store.db
    .prepare<[], { payload_json: string }>(
      "SELECT payload_json FROM outbox WHERE event_name = 'investigation.tool_called' ORDER BY sequence",
    )
    .all()
    .map((row) => (JSON.parse(row.payload_json) as { tool: string }).tool)
  report({ status: settled?.status, offerId: settled?.proposal?.offerId, tools })
  await desk.close()
}

async function crashAfterReservation(resume: boolean) {
  const lab = new FaultLab('LOG-001', { dataDirectory: directory })
  await lab.submit(caseFile('LOG-001').shipment)
  if (!resume) crash()
  const reservations = lab.agents.transport.store.db
    .prepare<[], { n: number }>('SELECT count(*) AS n FROM reservations')
    .get()
  report({ reservations: reservations?.n, r29: await lab.status('R29@LEG-1') })
}

async function crashWhileWaitingForHuman(resume: boolean) {
  const lab = new FaultLab('LOG-004', { dataDirectory: directory })
  if (!resume) {
    await lab.submit()
    crash()
  }
  const approval = await lab.approve('R13@ITEM-1', actor('alice', 'complianceReviewer'))
  const next = await lab.openTask('R13@ITEM-1')
  report({ approved: approval.ok, nextRole: next?.requiredRole })
}

const scenarios: Record<string, (resume: boolean) => Promise<void>> = {
  F01: crashDuringInvestigation,
  F02: crashAfterReservation,
  F03: crashWhileWaitingForHuman,
}
const [scenario, step] = phase.split(':')
const run = scenarios[scenario ?? '']
if (!run) throw new Error(`unknown crash phase ${phase}`)
await run(step === 'resume')
