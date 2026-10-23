import type { CheckStatus, Role } from '@durable-jev/contracts'
import { Panel } from '@xyflow/react'
import { createContext, type ReactNode, useContext, useEffect } from 'react'
import { checkStatusLabels, demoOperators, roleLabels } from '../labels'

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

/** Switches the console to act as a role; provided by the app, used by every role chip. */
export const RoleSwitch = createContext<{ current?: Role; switchTo(role: Role): void }>({
  switchTo: () => undefined,
})

/**
 * A role, in its colour, with the person who acts in it. Clicking it switches the console to that
 * role, so wherever the console says who is needed, the presenter can go straight there.
 */
export function RoleChip({ forRole: role, note }: { forRole: Role; note?: string }) {
  const { current, switchTo } = useContext(RoleSwitch)
  const label = (
    <>
      <span className="role-swatch" aria-hidden="true" />
      {roleLabels[role]}
      <span className="role-person">{demoOperators[role]}</span>
      {note && <span className="muted">{note}</span>}
    </>
  )
  if (role === current) {
    return (
      <span className="role-chip current" data-role={role} title="当前角色">
        {label}
      </span>
    )
  }
  return (
    <button
      type="button"
      className="role-chip"
      data-role={role}
      title={`切换到${roleLabels[role]}`}
      onClick={() => switchTo(role)}
    >
      {label}
      <span className="role-switch" aria-hidden="true">
        ⇄
      </span>
    </button>
  )
}
