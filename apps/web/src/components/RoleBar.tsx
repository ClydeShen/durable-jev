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
      <h1>Durable Jev Agent 演示</h1>
      <label>
        <span className="role-dot" aria-hidden="true" />
        当前角色
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
      <span className="operator" title="审计记录里的操作人，随角色切换">
        <span className="stat-label">操作人</span>
        <RoleChip forRole={actor.role} />
      </span>
      <button type="button" className="secondary" onClick={onReset}>
        重置演示
      </button>
    </header>
  )
}
