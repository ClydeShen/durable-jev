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
    <aside className="drawer" aria-label="详情">
      <header className="drawer-header">
        <div className="drawer-heading">{heading}</div>
        <button type="button" className="secondary small" onClick={onClose}>
          关闭
        </button>
      </header>
      <div className="drawer-body">{children}</div>
    </aside>
  )
}

/** Offers to undo the presenter's dragging; dragged positions are kept in this browser. */
export function LayoutReset({ count, onReset }: { count: number; onReset(): void }) {
  return (
    <Panel position="top-right" className="graph-hint">
      {count > 0 ? (
        <button type="button" className="secondary small" onClick={onReset}>
          恢复自动排版（已拖动 {count} 个）
        </button>
      ) : (
        '可拖动方块调整位置，浏览器会记住'
      )}
    </Panel>
  )
}
