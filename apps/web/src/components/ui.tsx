import { Panel } from '@xyflow/react'
import { type ReactNode, useEffect } from 'react'
import { Icon, type IconName } from './icons'

/** A square button showing only a common icon; its name is its tooltip and accessible name. */
export function IconButton({
  icon,
  label,
  onClick,
}: {
  icon: IconName
  label: string
  onClick(): void
}) {
  return (
    <button
      type="button"
      className="secondary icon-button"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  )
}

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
        <IconButton icon="close" label="Close" onClick={onClose} />
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
      <IconButton icon="reset" label="Restore automatic layout" onClick={onReset} />
    </Panel>
  )
}
