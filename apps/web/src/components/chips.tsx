/**
 * The console's small labels, in four kinds with one look each, so a reader learns them once:
 *
 * - Badge: a status (rule result, order, investigation), filled in the status colour.
 * - Chip: an identifier (rule, case, offer), monospaced; clickable when it leads somewhere.
 * - EntityChip: a person or an agent, with its colour dot; clickable to switch or open it.
 * - Tag: a category or count (rule kind, "Field operation"), neutral.
 *
 * All four share one height and baseline, so they line up wherever they meet.
 */
import type { CheckStatus, OrderStatus, Role } from '@durable-jev/contracts'
import { createContext, type MouseEvent, type ReactNode, useContext } from 'react'
import type { Investigation } from '../api'
import { checkStatusLabels, demoOperators, orderStatusLabels, roleLabels } from '../labels'

/** Cross-links the chips follow: switch to a role, open an agent's card. Provided by the app. */
export const ConsoleLinks = createContext<{
  currentRole?: Role
  switchRole(role: Role): void
  openAgent(agentId: string): void
}>({ switchRole: () => undefined, openAgent: () => undefined })

/** A status, filled in its colour. Every status in the console is drawn with this. */
export function Badge({
  tone,
  children,
  title,
}: {
  tone: CheckStatus | 'NONE'
  children: ReactNode
  title?: string
}) {
  return (
    <span className={`badge check-status ${tone}`} title={title}>
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status?: CheckStatus }) {
  return (
    <Badge tone={status ?? 'NONE'}>{status ? checkStatusLabels[status] : 'Not evaluated'}</Badge>
  )
}

/** An order's status in the colour of the rule status it corresponds to. */
const orderTones: Record<OrderStatus, CheckStatus> = {
  SUBMITTED: 'BLOCKED_DEPENDENCY',
  EVALUATING: 'BLOCKED_DEPENDENCY',
  ON_HOLD: 'UNKNOWN',
  AWAITING_HUMAN: 'WAITING_HUMAN',
  READY_TO_DISPATCH: 'PASS',
  DISPATCHED: 'PASS',
  REJECTED: 'FAIL',
  TECHNICAL_FAILURE: 'ERROR',
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={orderTones[status]}>{orderStatusLabels[status]}</Badge>
}

const investigationLabels: Record<Investigation['status'], string> = {
  RUNNING: 'Investigating',
  PROPOSED: 'Awaiting the planner',
  ESCALATED: 'Handed to a person',
  CONFIRMED: 'Reroute confirmed',
  REJECTED: 'Rejected',
  STALE: 'Out of date',
}

const investigationTones: Record<Investigation['status'], CheckStatus> = {
  RUNNING: 'BLOCKED_DEPENDENCY',
  PROPOSED: 'WAITING_HUMAN',
  ESCALATED: 'WAITING_HUMAN',
  CONFIRMED: 'PASS',
  REJECTED: 'UNKNOWN',
  STALE: 'NOT_APPLICABLE',
}

export function InvestigationBadge({ status }: { status: Investigation['status'] }) {
  return <Badge tone={investigationTones[status]}>{investigationLabels[status]}</Badge>
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

/**
 * A category or a count: neutral, so it never competes with a status. A tone marks the few tags
 * that stand out: a count that matters, or a rule's relation to the selected one.
 */
export function Tag({
  children,
  title,
  tone,
}: {
  children: ReactNode
  title?: string
  tone?: 'highlight' | 'upstream' | 'downstream'
}) {
  return (
    <span className={tone ? `tag ${tone}` : 'tag'} title={title}>
      {children}
    </span>
  )
}

/** A list of short items, one tag each, instead of a run of text joined by separators. */
export function Tags({ items, empty = 'None' }: { items: readonly string[]; empty?: string }) {
  if (items.length === 0) return <span className="muted">{empty}</span>
  return (
    <span className="chips">
      {items.map((item) => (
        <Tag key={item}>{item}</Tag>
      ))}
    </span>
  )
}

interface EntityChipProps {
  /** The colour comes from the role or agent this attribute names. */
  colour: { 'data-role': Role } | { 'data-agent': string }
  children: ReactNode
  title?: string
  /** What clicking does; without it the chip is a plain label. */
  onClick?(): void
  /** The symbol after the label that says what clicking does. */
  action?: string
}

/** A person or an agent, with its colour dot. */
function EntityChip({ colour, children, title, onClick, action }: EntityChipProps) {
  const content = (
    <>
      <span className="entity-dot" aria-hidden="true" />
      {children}
      {onClick && action && (
        <span className="entity-action" aria-hidden="true">
          {action}
        </span>
      )}
    </>
  )
  if (!onClick) {
    return (
      <span className="entity-chip" title={title} {...colour}>
        {content}
      </span>
    )
  }
  return (
    <button
      type="button"
      className="entity-chip"
      title={title}
      {...colour}
      // A chip inside a clickable row does its own thing, not the row's.
      onClick={(event: MouseEvent) => {
        event.stopPropagation()
        onClick()
      }}
    >
      {content}
    </button>
  )
}

/**
 * A role with the person who acts in it. Clicking switches the console to that role, so
 * wherever the console says who is needed, the presenter can go straight there.
 */
export function RoleChip({ forRole, note }: { forRole: Role; note?: string }) {
  const { currentRole, switchRole } = useContext(ConsoleLinks)
  const current = forRole === currentRole
  return (
    <EntityChip
      colour={{ 'data-role': forRole }}
      title={current ? 'Current role' : `Switch to ${roleLabels[forRole]}`}
      onClick={current ? undefined : () => switchRole(forRole)}
      action="⇄"
    >
      {roleLabels[forRole]}
      <strong>{demoOperators[forRole]}</strong>
      {note && <span className="muted">{note}</span>}
    </EntityChip>
  )
}

/** An agent; clicking opens its card. */
export function AgentChip({ agentId, name }: { agentId: string; name: string }) {
  const { openAgent } = useContext(ConsoleLinks)
  return (
    <EntityChip
      colour={{ 'data-agent': agentId }}
      title={`Open the card of ${name}`}
      onClick={() => openAgent(agentId)}
      action="›"
    >
      {name}
    </EntityChip>
  )
}

/** A role as a plain label in its colour, for places that are themselves clickable. */
export function RoleLabel({ forRole, prefix }: { forRole: Role; prefix?: string }) {
  return (
    <EntityChip colour={{ 'data-role': forRole }}>
      {prefix}
      {roleLabels[forRole]}
    </EntityChip>
  )
}
