import type { Actor, CaseDetail } from '../api'
import { orderStatusLabels } from '../labels'
import { RoleChip } from './ui'

interface Props {
  detail: CaseDetail
  actor: Actor
  onDispatch(): void
  onRevise(index: number): void
  onReportIncident(index: number): void
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

export function CaseHeader({ detail, actor, onDispatch, onRevise, onReportIncident }: Props) {
  const canDispatch = actor.role === 'dispatcher' && detail.status === 'READY_TO_DISPATCH'
  const open = detail.status !== 'DISPATCHED'
  const nextRevision = detail.revisions.find((revision) => !revision.applied)
  const nextIncident = detail.incidents[detail.investigations.length]
  return (
    <section className="case-header">
      <div className="case-title">
        <h2>{detail.caseId}</h2>
        <span className={`order-status ${detail.status}`}>{orderStatusLabels[detail.status]}</span>
        {canDispatch && (
          <button type="button" className="primary-action" onClick={onDispatch}>
            确认发运
          </button>
        )}
      </div>
      <p className="story">{detail.story}</p>
      <div className="case-facts">
        <Stat label="资料版本" value={`r${detail.caseRevision}`} />
        <Stat label="货物" value={`${detail.shipment.cargoItems.length} 件`} />
        <Stat label="运输段" value={`${detail.shipment.legs.length} 个`} />
        <div className="stat">
          <span className="stat-value chips">
            {detail.waitingOn.length === 0
              ? '—'
              : detail.waitingOn.map((role) => <RoleChip key={role} forRole={role} />)}
          </span>
          <span className="stat-label">正在等</span>
        </div>
        {open && (nextRevision || nextIncident) && (
          <div className="demo-actions">
            <span className="stat-label">演示操作</span>
            {nextRevision && (
              <button
                type="button"
                className="secondary small"
                onClick={() => onRevise(nextRevision.index)}
              >
                变更资料：{nextRevision.label}
              </button>
            )}
            {nextIncident && (
              <button
                type="button"
                className="secondary small"
                title="模拟一个意外：运输计划 agent 会启动调查助手找替代方案，提议交给运输计划员确认"
                onClick={() => onReportIncident(nextIncident.index)}
              >
                发生事件：{nextIncident.label}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
