import { join } from 'node:path'
import type { CaseView } from '@durable-jev/agent-core'
import type { HumanTask, Role, Shipment } from '@durable-jev/contracts'
import type { HumanAction } from '@durable-jev/human-tasks'
import {
  type CaseFile,
  caseEventKey,
  createLocalLogisticsAgents,
  dispatchCase,
  type LocalLogisticsAgents,
  loadCaseCatalog,
  RerouteDesk,
  type RerouteDeskOptions,
  scriptedRerouter,
} from '@durable-jev/logistics'
import { ScriptedJudge, type SemanticJudge } from '@durable-jev/model-providers'

const repositoryRoot = new URL('../../../../', import.meta.url).pathname
export const materials = join(repositoryRoot, 'eval/materials')
const catalog = loadCaseCatalog(join(materials, 'cases'))

export function caseFile(caseId: string): CaseFile {
  const file = catalog.get(caseId)
  if (!file) throw new Error(`no case ${caseId}`)
  return file
}

export const actor = (id: string, role: Role) => ({ id, role })

export interface LabOptions {
  dataDirectory?: string
  judgeFor?(shipment: Shipment): SemanticJudge
}

/** The five agents of one demo case, in process, with a controllable clock. */
export class FaultLab {
  clock = Date.parse('2026-10-30T08:00:00Z')
  readonly agents: LocalLogisticsAgents

  constructor(
    readonly caseId: string,
    options: LabOptions = {},
  ) {
    this.agents = createLocalLogisticsAgents({
      materialsDirectory: materials,
      dataDirectory: options.dataDirectory,
      judgeFor: options.judgeFor ?? (() => new ScriptedJudge(caseFile(caseId).scriptedJudgements)),
      now: () => this.now(),
    })
  }

  now = () => new Date(this.clock).toISOString()

  get shipment(): Shipment {
    const shipment = this.agents.coordination.store.caseRecord(this.caseId)?.shipment
    return shipment ?? caseFile(this.caseId).shipment
  }

  submit(shipment: Shipment = caseFile(this.caseId).shipment) {
    return this.agents.orchestrator.submit(shipment)
  }

  async view(): Promise<CaseView> {
    const { outcomes, tasks } = await this.agents.orchestrator.state(this.caseId)
    return { record: this.agents.coordination.runtime.view(this.caseId).record, outcomes, tasks }
  }

  async status(key: string) {
    const { outcomes } = await this.view()
    return outcomes.find((outcome) => caseEventKey(outcome.ruleId, outcome.scope) === key)?.status
  }

  async openTask(key: string): Promise<HumanTask | undefined> {
    return (await this.view()).tasks.find(
      (task) => task.status === 'OPEN' && caseEventKey(task.ruleId, task.scope) === key,
    )
  }

  async decide(task: HumanTask, action: HumanAction) {
    return this.agents.orchestrator.decide(task.humanTaskId, action)
  }

  async approve(key: string, approver: { id: string; role: Role }) {
    const task = await this.openTask(key)
    if (!task) throw new Error(`no open task ${key}`)
    return this.decide(task, { type: 'approve', actor: approver })
  }

  dispatch(dispatcher = actor('dee', 'dispatcher')): ReturnType<typeof dispatchCase> {
    return dispatchCase(
      this.agents.orchestrator,
      this.agents.coordination.store,
      this.caseId,
      dispatcher,
      this.now,
    )
  }

  openDesk(options: Partial<RerouteDeskOptions> = {}) {
    return RerouteDesk.open({
      ...this.agents.transport,
      cases: this.agents.transport.store,
      storage: 'memory',
      model: { kind: 'scripted', next: scriptedRerouter },
      now: this.now,
      ...options,
    })
  }
}
