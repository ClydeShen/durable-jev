import type {
  Investigation,
  InvestigationStatus,
  ReferenceData,
  Role,
  Shipment,
} from '@durable-jev/contracts'
import { useState } from 'react'
import { roleLabels } from './roles.js'

const plannerRole: Role = 'TRANSPORT_PLANNER'

const statusLabels: Record<InvestigationStatus, string> = {
  RUNNING: 'Running',
  PROPOSED: 'Proposal waiting for the planner',
  NO_CANDIDATE: 'No replacement found',
  ESCALATED: 'Handed to the planner',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  STALE: 'Out of date: the plan changed',
}

export type InvestigationActions = {
  investigate: (request: {
    legId: string
    unavailableCarrierIds: string[]
    reason: string
  }) => Promise<void>
  accept: (investigation: Investigation) => Promise<void>
  reject: (investigation: Investigation, reason: string) => Promise<void>
}

export function InvestigationPanel(props: {
  shipment: Shipment
  investigations: Investigation[]
  referenceData: ReferenceData | undefined
  actingRole: Role
  disabled: boolean
  actions: InvestigationActions
}) {
  const { shipment, referenceData } = props
  const carrierName = (carrierId: string) =>
    referenceData?.carriers.find((carrier) => carrier.carrierId === carrierId)?.name ?? carrierId

  return (
    <section>
      <h2>Carrier investigation</h2>
      <p className="muted small">
        An agent looks for a replacement carrier and checks it against the plan rules. It can only
        propose; accepting applies the change as a normal plan change and re-checks the rules.
      </p>
      {!props.disabled &&
        shipment.legs.map((leg) => (
          <InvestigateRow
            key={leg.legId}
            label={`Leg ${leg.sequence}: replace ${carrierName(leg.carrierId)}`}
            warning={props.actingRole !== plannerRole}
            onInvestigate={(reason) =>
              props.actions.investigate({
                legId: leg.legId,
                unavailableCarrierIds: [leg.carrierId],
                reason,
              })
            }
          />
        ))}
      <ul className="investigations">
        {[...props.investigations].reverse().map((investigation) => (
          <InvestigationItem
            key={investigation.investigationId}
            investigation={investigation}
            carrierName={carrierName}
            actions={props.actions}
          />
        ))}
      </ul>
    </section>
  )
}

function InvestigateRow(props: {
  label: string
  warning: boolean
  onInvestigate: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('Carrier cancelled the booking')
  return (
    <div className="row change-row">
      <span className="small">{props.label}</span>
      <input
        aria-label="Reason"
        className="reason-input"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <button type="button" disabled={!reason.trim()} onClick={() => props.onInvestigate(reason)}>
        Find replacement
      </button>
      {props.warning && <span className="warning small">requires {roleLabels[plannerRole]}</span>}
    </div>
  )
}

function InvestigationItem(props: {
  investigation: Investigation
  carrierName: (carrierId: string) => string
  actions: InvestigationActions
}) {
  const { investigation, carrierName, actions } = props
  const [rejectReason, setRejectReason] = useState('')
  return (
    <li className={`investigation investigation-${investigation.status.toLowerCase()}`}>
      <div className="row">
        <strong>{statusLabels[investigation.status]}</strong>
        <span className="muted small">
          r{investigation.caseRevision} · {investigation.legId}
        </span>
      </div>
      {investigation.proposal && (
        <div>
          Proposed: {carrierName(investigation.proposal.carrierId)} with{' '}
          {investigation.proposal.vehicleId}
        </div>
      )}
      {investigation.summary && <div className="small">{investigation.summary}</div>}
      <div className="muted small">
        {investigation.modelId} · {investigation.toolCalls} tool calls
        {investigation.decisionReason && ` · ${investigation.decisionReason}`}
      </div>
      {investigation.status === 'PROPOSED' && (
        <div className="row change-row">
          <button type="button" onClick={() => actions.accept(investigation)}>
            Accept proposal
          </button>
          <input
            aria-label="Rejection reason"
            className="reason-input"
            placeholder="reason to reject"
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
          />
          <button
            type="button"
            disabled={!rejectReason.trim()}
            onClick={() => actions.reject(investigation, rejectReason)}
          >
            Reject
          </button>
        </div>
      )}
    </li>
  )
}
