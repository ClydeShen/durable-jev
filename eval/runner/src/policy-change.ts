import { CaseStore, type CaseView } from '@durable-jev/agent-core'
import type { Shipment } from '@durable-jev/contracts'
import { type CaseFile, createLogisticsRuntime } from '@durable-jev/logistics'
import { ScriptedJudge } from '@durable-jev/model-providers'

const targetRule = 'R35'
const now = () => '2026-10-30T08:00:00Z'

type PolicyActivation = 'pinned' | 're-evaluate'

interface RuleSnapshot {
  status: string
  fingerprint: string
  openApprovals: number
  tasks: { id: string; status: string }[]
}

export interface PolicyObservation {
  scenario: string
  extraCostCents: number
  activation: PolicyActivation | 'new-order'
  policyPack: 'baseline' | 'candidate'
  before?: RuleSnapshot
  after: RuleSnapshot
  evaluationMs: number
  priorTaskDecision?: string
}

function snapshot(view: CaseView): RuleSnapshot {
  const outcome = view.outcomes.find((item) => item.ruleId === targetRule)
  if (!outcome) throw new Error(`no outcome for ${targetRule}`)
  const tasks = view.tasks.filter((task) => task.ruleId === targetRule)
  return {
    status: outcome.status,
    fingerprint: outcome.inputFingerprint,
    openApprovals: tasks.filter((task) => task.status === 'OPEN').length,
    tasks: tasks.map((task) => ({ id: task.humanTaskId, status: task.status })),
  }
}

function runtime(materials: string, store: CaseStore, sample: CaseFile) {
  return createLogisticsRuntime({
    agentId: 'commercial-control',
    materialsDirectory: materials,
    store,
    judgeFor: () => new ScriptedJudge(sample.scriptedJudgements),
    now,
  }).runtime
}

function shipmentOf(sample: CaseFile, extraCostCents: number): Shipment {
  return {
    ...sample.shipment,
    quote: { ...sample.shipment.quote, extraCostCents },
  }
}

const approval = { type: 'approve', actor: { id: 'carol', role: 'commercialManager' } } as const

async function newOrder(
  materials: string,
  sample: CaseFile,
  extraCostCents: number,
  policyPack: 'baseline' | 'candidate',
) {
  const store = CaseStore.open(':memory:')
  try {
    const started = performance.now()
    const agent = runtime(materials, store, sample)
    const view = await agent.submit(shipmentOf(sample, extraCostCents))
    return {
      scenario: 'New order',
      extraCostCents,
      activation: 'new-order' as const,
      policyPack,
      after: snapshot(view),
      evaluationMs: performance.now() - started,
    }
  } finally {
    store.db.close()
  }
}

async function existingOrder(
  baseline: string,
  candidate: string,
  sample: CaseFile,
  extraCostCents: number,
  approved: boolean,
  activation: PolicyActivation,
): Promise<PolicyObservation> {
  const store = CaseStore.open(':memory:')
  try {
    const original = runtime(baseline, store, sample)
    await original.submit(shipmentOf(sample, extraCostCents))
    const task = original
      .view(sample.shipment.caseId)
      .tasks.find((item) => item.ruleId === targetRule && item.status === 'OPEN')
    if (approved) {
      if (!task) throw new Error('the approved scenario needs an initial open task')
      const decision = await original.decide(task.humanTaskId, approval)
      if (!decision.ok) throw new Error(`setup approval refused: ${decision.reason}`)
    }
    const before = snapshot(original.view(sample.shipment.caseId))
    const started = performance.now()
    const updated = runtime(activation === 'pinned' ? baseline : candidate, store, sample)
    const after = snapshot(await updated.evaluate(sample.shipment.caseId))
    const evaluationMs = performance.now() - started
    const decision =
      task && !approved ? await updated.decide(task.humanTaskId, approval) : undefined
    return {
      scenario: approved ? 'Previously approved order' : 'Unapproved order',
      extraCostCents,
      activation,
      policyPack: activation === 'pinned' ? 'baseline' : 'candidate',
      before,
      after,
      evaluationMs,
      priorTaskDecision: decision && (decision.ok ? 'ACCEPTED' : decision.reason),
    }
  } finally {
    store.db.close()
  }
}

/** Characterizes one draft parameter change, not authoring quality or whole-order release. */
export async function observePolicyChange(
  baseline: string,
  candidate: string,
  sample: CaseFile,
): Promise<PolicyObservation[]> {
  const observations: PolicyObservation[] = []
  for (const cents of [49_999, 50_000, 50_001, 74_999, 75_000, 75_001]) {
    observations.push(await newOrder(baseline, sample, cents, 'baseline'))
    observations.push(await newOrder(candidate, sample, cents, 'candidate'))
  }
  for (const activation of ['pinned', 're-evaluate'] as const) {
    for (const cents of [40_000, 60_000, 80_000]) {
      observations.push(await existingOrder(baseline, candidate, sample, cents, false, activation))
    }
    for (const cents of [60_000, 80_000]) {
      observations.push(await existingOrder(baseline, candidate, sample, cents, true, activation))
    }
  }
  return observations
}
