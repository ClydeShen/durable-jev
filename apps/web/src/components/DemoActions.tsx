import { type ReactNode, useState } from 'react'
import type { CaseDetail } from '../api'
import { changeLabels } from '../labels'
import { Modal } from './ui'

type Scene = CaseDetail['incidents'][number]

/** A demo action as a scene: what happened, then what the engine does when it is applied. */
function SceneBody({ scene, children }: { scene: Scene; children?: ReactNode }) {
  return (
    <>
      <p className="modal-lead">{scene.label}</p>
      <section className="scene">
        <h4>What happened</h4>
        <p className="scene-story">{scene.situation}</p>
      </section>
      <section className="scene">
        <h4>When you apply it</h4>
        <ul className="scene-outcome">
          {scene.outcome.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
      {children}
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
          <SceneBody scene={revision}>
            <p className="scene-note">
              Data that changes:{' '}
              {revision.changes.map((entity) => changeLabels[entity] ?? entity).join(', ')} · New
              revision r{detail.caseRevision + 1}
            </p>
          </SceneBody>
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
          <SceneBody scene={incident} />
        </Modal>
      )}
    </div>
  )
}
