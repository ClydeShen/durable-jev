import type { Role } from '@durable-jev/contracts'
import type { Actor } from '../api'
import { demoOperators, roleLabels } from '../labels'
import { RoleChip } from './chips'

interface Props {
  actor: Actor
  onChange(actor: Actor): void
  onReset(): void
}

/** Who is acting: the presenter picks a role, and each role has its own operator. */
export function RoleBar({ actor, onChange, onReset }: Props) {
  return (
    <header className="role-bar">
      <h1>Durable Jev Agent demo</h1>
      <label>
        <span className="role-dot" aria-hidden="true" />
        Current role
        <select
          value={actor.role}
          onChange={(event) => {
            const role = event.target.value as Role
            onChange({ role, id: demoOperators[role] })
          }}
        >
          {Object.entries(roleLabels).map(([role, label]) => (
            <option key={role} value={role}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <span
        className="operator"
        title="The person recorded in the audit trail; changes with the role"
      >
        <span className="stat-label">Operator</span>
        <RoleChip forRole={actor.role} />
      </span>
      <button type="button" className="secondary" onClick={onReset}>
        Reset demo
      </button>
    </header>
  )
}
