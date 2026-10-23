import { useState } from 'react'
import type { CaseDetail } from '../api'
import { changeLabels } from '../labels'
import { Tag } from './chips'
import { Field, Fields, Modal } from './ui'

type Revision = CaseDetail['revisions'][number]
type Incident = CaseDetail['incidents'][number]

function ChangeDetails({ revision, nextRevision }: { revision: Revision; nextRevision: number }) {
  const changed = revision.changes.map((entity) => changeLabels[entity] ?? entity)
  return (
    <>
      <p className="modal-lead">{revision.label}</p>
      <Fields>
        <Field label="Data that changes">
          <span className="chips">
            {changed.map((entity) => (
              <Tag key={entity}>{entity}</Tag>
            ))}
          </span>
        </Field>
        <Field label="New revision">r{nextRevision}</Field>
      </Fields>
      <ol className="modal-steps">
        <li>The order moves to revision r{nextRevision}.</li>
        <li>
          Rules that read the {changed.join(' and ')} turn purple (invalidated) and are decided
          again; every other result is kept.
        </li>
        <li>
          Approvals given on the old data no longer count; open tasks whose inputs did not change
          carry over.
        </li>
      </ol>
    </>
  )
}

function IncidentDetails({ incident }: { incident: Incident }) {
  return (
    <>
      <p className="modal-lead">{incident.label}</p>
      <ol className="modal-steps">
        <li>The transport planning agent starts its investigation helper.</li>
        <li>The helper looks up spare capacity and checks each option against the rules.</li>
        <li>
          It proposes the cheapest option that passes. The order does not change until the transport
          planner confirms.
        </li>
      </ol>
    </>
  )
}

interface Props {
  detail: CaseDetail
  onRevise(index: number): void
  onReportIncident(index: number): void
}

/** The case's scripted next event; each one explains itself and runs only once confirmed. */
export function DemoActions({ detail, onRevise, onReportIncident }: Props) {
  const [open, setOpen] = useState<'revise' | 'incident'>()
  const revision = detail.revisions.find((candidate) => !candidate.applied)
  const incident = detail.incidents[detail.investigations.length]
  if (detail.status === 'DISPATCHED' || !(revision || incident)) return null
  const close = () => setOpen(undefined)
  const confirm = (run: () => void) => {
    close()
    run()
  }
  return (
    <div className="stat demo-actions">
      <span className="stat-label">Demo actions</span>
      <span className="stat-value">
        {revision && (
          <button type="button" className="secondary small" onClick={() => setOpen('revise')}>
            Change the order
          </button>
        )}
        {incident && (
          <button type="button" className="secondary small" onClick={() => setOpen('incident')}>
            Report an incident
          </button>
        )}
      </span>
      {open === 'revise' && revision && (
        <Modal
          title="Change the order"
          onClose={close}
          footer={
            <>
              <button type="button" className="secondary" onClick={close}>
                Cancel
              </button>
              <button type="button" onClick={() => confirm(() => onRevise(revision.index))}>
                Apply change
              </button>
            </>
          }
        >
          <ChangeDetails revision={revision} nextRevision={detail.caseRevision + 1} />
        </Modal>
      )}
      {open === 'incident' && incident && (
        <Modal
          title="Report an incident"
          onClose={close}
          footer={
            <>
              <button type="button" className="secondary" onClick={close}>
                Cancel
              </button>
              <button type="button" onClick={() => confirm(() => onReportIncident(incident.index))}>
                Report incident
              </button>
            </>
          }
        >
          <IncidentDetails incident={incident} />
        </Modal>
      )}
    </div>
  )
}
