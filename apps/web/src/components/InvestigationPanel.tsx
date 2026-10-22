import type { Actor, Investigation } from '../api'
import { checkStatusLabels } from '../labels'

const statusLabels: Record<Investigation['status'], string> = {
  RUNNING: '调查中',
  PROPOSED: '待计划员确认',
  ESCALATED: '已转人工',
  CONFIRMED: '已确认改派',
  REJECTED: '已否决',
  STALE: '已过期',
}

const time = (timestamp: string) => timestamp.slice(11, 16)

interface Props {
  investigations: Investigation[]
  actor: Actor
  onDecide(investigation: Investigation, type: 'confirm' | 'reject'): void
}

export function InvestigationPanel({ investigations, actor, onDecide }: Props) {
  return (
    <section className="investigations">
      {investigations.map((investigation) => {
        const { proposal } = investigation
        const canDecide = investigation.status === 'PROPOSED' && actor.role === 'transportPlanner'
        return (
          <article key={investigation.investigationId} className="investigation">
            <header>
              <strong>运输 agent 调查助手</strong> · {investigation.incident.legId} 承运商取消 · r
              {investigation.caseRevision}
              <span className={`investigation-status ${investigation.status}`}>
                {statusLabels[investigation.status]}
              </span>
            </header>
            {proposal && (
              <>
                <p>
                  提议改派 {proposal.carrierId} / {proposal.vehicleId}，
                  {time(proposal.plannedDeparture)} 出发 · {time(proposal.plannedArrival)}{' '}
                  到达（UTC），额外费用 €{(proposal.extraCostCents / 100).toFixed(2)}
                </p>
                <p className="rationale">{proposal.rationale}</p>
                <div className="checks">
                  规则预检：
                  {proposal.checks.map((check) => (
                    <span
                      key={`${check.ruleId}@${check.scope}`}
                      className={`check ${check.status}`}
                    >
                      {check.ruleId} {checkStatusLabels[check.status]}
                    </span>
                  ))}
                </div>
              </>
            )}
            {investigation.escalation && <p className="rationale">{investigation.escalation}</p>}
            {investigation.decidedBy && (
              <small>
                {investigation.decidedBy.id}（{investigation.decidedBy.role}）
                {statusLabels[investigation.status]}
              </small>
            )}
            {canDecide && (
              <div className="actions">
                <button type="button" onClick={() => onDecide(investigation, 'confirm')}>
                  确认改派
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onDecide(investigation, 'reject')}
                >
                  否决
                </button>
              </div>
            )}
          </article>
        )
      })}
    </section>
  )
}
