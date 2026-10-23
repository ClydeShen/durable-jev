import { Panel } from '@xyflow/react'
import { type ReactNode, useEffect } from 'react'

/** A labelled value: the label says what the value is, so values never run together in a line. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <span className="field-value">{children}</span>
    </div>
  )
}

export function Fields({ children }: { children: ReactNode }) {
  return <div className="fields">{children}</div>
}

export function Section({
  title,
  action,
  children,
}: {
  title: string
  /** A link-like control on the heading line, such as "open the rule graph". */
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="drawer-section">
      <div className="section-heading">
        <h4>{title}</h4>
        {action}
      </div>
      {children}
    </section>
  )
}

/** A panel that slides over the right side of the main area, for detail the audience reads. */
export function Drawer({
  heading,
  onClose,
  children,
}: {
  heading: ReactNode
  onClose(): void
  children: ReactNode
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  return (
    <aside className="drawer" aria-label="Details">
      <header className="drawer-header">
        <div className="drawer-heading">{heading}</div>
        <button type="button" className="secondary small" onClick={onClose}>
          Close
        </button>
      </header>
      <div className="drawer-body">{children}</div>
    </aside>
  )
}

/** The one bar at the top of a graph, for what applies to the whole graph. Empty, it is hidden. */
export function GraphBar({ children }: { children: ReactNode }) {
  return (
    <Panel position="top-center" className="graph-bar">
      {children}
    </Panel>
  )
}

/** Offers to undo the presenter's dragging, at the graph's top right; positions stay in this browser. */
export function LayoutReset({ moved, onReset }: { moved: boolean; onReset(): void }) {
  if (!moved) return null
  return (
    <Panel position="top-right">
      <button
        type="button"
        className="secondary icon-button"
        aria-label="Restore automatic layout"
        title="Restore automatic layout"
        onClick={onReset}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path
            d="M3 8a5 5 0 1 0 1.5-3.6M3 2.5v2.5h2.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </Panel>
  )
}
