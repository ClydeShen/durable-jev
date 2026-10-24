import { canonicalJson } from '@durable-jev/contracts'
import { applyRevision } from '@durable-jev/logistics'
import {
  ScriptedJudge,
  type SemanticAnswer,
  type SemanticQuestion,
  type SemanticState,
} from '@durable-jev/model-providers'
import { caseFile, FaultLab } from './faults/lab.js'

export const probeCases = [
  {
    id: 'P2-corrected-sds',
    mutation: 'P2',
    caseId: 'LOG-003',
    revise: true,
    rule: 'R10',
    gate: 'R13',
  },
  {
    id: 'P3-damaged-packaging',
    mutation: 'P3',
    caseId: 'LOG-008',
    revise: true,
    rule: 'R18',
    gate: 'R21',
  },
  {
    id: 'P3-intact-packaging',
    mutation: 'P3',
    caseId: 'LOG-008',
    revise: false,
    rule: 'R18',
    gate: 'R21',
  },
] as const

export interface ProbeInput {
  question: SemanticQuestion
  state: SemanticState
  scripted: SemanticAnswer
}

/** Capture an existing rule's exact input offline; replaying a live answer performs no network IO. */
export async function observeJevProbe(
  spec: (typeof probeCases)[number],
  materialsDirectory: string,
  supplied?: { input: ProbeInput; answer: SemanticAnswer },
) {
  const sample = caseFile(spec.caseId)
  const scripted = new ScriptedJudge(sample.scriptedJudgements)
  let input: ProbeInput | undefined
  let substituted = 0
  const lab = new FaultLab(spec.caseId, {
    materialsDirectory,
    judgeFor: () => ({
      provider: 'scripted',
      async ask(question, state) {
        const answer = await scripted.ask(question, state)
        if (question.questionId !== spec.rule) return answer
        const captured = { question, state, scripted: answer }
        if (input && canonicalJson(input) !== canonicalJson(captured))
          throw new Error('probe has multiple semantic inputs')
        input = captured
        if (!supplied) return answer
        if (canonicalJson(input) !== canonicalJson(supplied.input))
          throw new Error('frozen semantic input changed')
        substituted++
        return supplied.answer
      },
    }),
  })
  try {
    const revision = sample.events.find((event) => event.kind === 'revise')
    if (spec.revise && !revision) throw new Error('missing probe revision')
    const shipment =
      spec.revise && revision ? applyRevision(sample.shipment, revision.patch) : sample.shipment
    await lab.submit(shipment)
    const view = await lab.view()
    if (!input || (supplied && substituted === 0))
      throw new Error('target semantic rule was not evaluated')
    return {
      input,
      outcomes: view.outcomes
        .filter((outcome) => [spec.rule, spec.gate].some((id) => id === outcome.ruleId))
        .map((outcome) => ({
          ruleId: outcome.ruleId,
          status: outcome.status,
          observedValue: outcome.observedValue,
        })),
      tasks: view.tasks
        .filter((task) => task.ruleId === spec.gate)
        .map((task) => ({
          ruleId: task.ruleId,
          role: task.requiredRole,
          status: task.status,
          evidence: task.evidenceRequirements,
        })),
    }
  } finally {
    lab.agents.close()
  }
}
