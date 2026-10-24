import type { Role } from '@durable-jev/contracts'
import { useId, useRef, useState } from 'react'
import type { Actor } from '../api'
import { demoOperator, roleLabels } from '../labels'
import { useDismiss } from '../use-dismiss'
import { PolicyDialog } from './PolicyDialog'

const roles = Object.keys(roleLabels) as Role[]

/** The current role and its operator in one chip; clicking it lists the other roles. */
function RoleMenu({ actor, onChange }: { actor: Actor; onChange(actor: Actor): void }) {
  const menuId = useId()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useDismiss(open, root, () => setOpen(false))
  const choose = (role: Role) => {
    const id = demoOperator(role)
    if (!id) return
    onChange({ role, id })
    setOpen(false)
  }
  return (
    <div className="role-menu" ref={root}>
      <button
        type="button"
        className="entity-chip role-current"
        data-role={actor.role}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title="Act in another role"
        onClick={() => setOpen(!open)}
      >
        <span className="entity-dot" aria-hidden="true" />
        {roleLabels[actor.role]}
        <strong>{demoOperator(actor.role)}</strong>
        <span className="entity-action" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div id={menuId} role="menu" className="role-options">
          {roles.map((role) => (
            <button
              key={role}
              type="button"
              role="menuitemradio"
              aria-checked={role === actor.role}
              data-role={role}
              onClick={() => choose(role)}
            >
              <span className="entity-dot" aria-hidden="true" />
              <span>{roleLabels[role]}</span>
              <span className="muted">{demoOperator(role)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface Props {
  actor: Actor
  onChange(actor: Actor): void
  onReset(): void
}

/** Who is acting: the presenter picks a role, and each role has its own operator. */
export function RoleBar({ actor, onChange, onReset }: Props) {
  const [policyOpen, setPolicyOpen] = useState(false)
  return (
    <header className="role-bar">
      <h1>Durable Jev Agent demo</h1>
      <RoleMenu actor={actor} onChange={onChange} />
      <button type="button" className="secondary" onClick={() => setPolicyOpen(true)}>
        Policy
      </button>
      <button type="button" className="secondary" onClick={onReset}>
        Reset demo
      </button>
      {policyOpen && <PolicyDialog onClose={() => setPolicyOpen(false)} />}
    </header>
  )
}
