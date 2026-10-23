import type { Actor, CaseDetail, RuleInfo } from '../api'
import type { useActions } from '../use-actions'
import { CaseHeader } from './CaseHeader'
import { InvestigationPanel } from './InvestigationPanel'
import { NextSteps } from './NextSteps'

interface Props {
  detail: CaseDetail
  actor: Actor
  rules: readonly RuleInfo[]
  actions: ReturnType<typeof useActions>
  onShowRule(ruleId: string): void
  onReset(): void
}

/** The top of a case: its header with the demo actions, the next steps, the investigations. */
export function CaseTop({ detail, actor, rules, actions, onShowRule, onReset }: Props) {
  const { caseId } = detail
  return (
    <>
      <CaseHeader
        detail={detail}
        actor={actor}
        onDispatch={() => actions.dispatch(caseId)}
        onRevise={(index) => actions.revise(caseId, index)}
        onReportIncident={(index) => actions.reportIncident(caseId, index)}
        onReset={onReset}
      />
      <NextSteps detail={detail} rules={rules} onShowRule={onShowRule} />
      {detail.investigations.length > 0 && (
        <InvestigationPanel
          investigations={detail.investigations}
          actor={actor}
          onDecide={actions.decideProposal}
        />
      )}
    </>
  )
}
