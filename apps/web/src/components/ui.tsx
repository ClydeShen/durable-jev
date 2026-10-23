import type { CheckStatus } from '@durable-jev/contracts'
import { Panel } from '@xyflow/react'
import type { ReactNode } from 'react'
import { checkStatusLabels } from '../labels'

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

export function StatusBadge({ status }: { status?: CheckStatus }) {
  return (
    <span className={`status-badge check-status ${status ?? 'NONE'}`}>
      {status ? checkStatusLabels[status] : '未评估'}
    </span>
  )
}

/** An identifier such as a rule id; clickable when it leads somewhere. */
export function Chip({
  children,
  title,
  onClick,
}: {
  children: ReactNode
  title?: string
  onClick?(): void
}) {
  return onClick ? (
    <button type="button" className="chip link" title={title} onClick={onClick}>
      {children}
    </button>
  ) : (
    <span className="chip" title={title}>
      {children}
    </span>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="drawer-section">
      <h4>{title}</h4>
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
  return (
    <aside className="drawer">
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

/** A list of short items, one tag each, instead of a run of text joined by separators. */
export function Tags({ items, empty = '无' }: { items: readonly string[]; empty?: string }) {
  if (items.length === 0) return <span className="muted">{empty}</span>
  return (
    <span className="chips">
      {items.map((item) => (
        <span key={item} className="tag">
          {item}
        </span>
      ))}
    </span>
  )
}
