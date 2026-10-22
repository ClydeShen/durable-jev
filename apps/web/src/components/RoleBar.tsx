import type { Role } from '@durable-jev/contracts'
import type { Actor } from '../api'
import { roleLabels } from '../labels'

interface Props {
  actor: Actor
  onChange(actor: Actor): void
  onReset(): void
}

export function RoleBar({ actor, onChange, onReset }: Props) {
  return (
    <header className="role-bar">
      <h1>Durable Jev Agent 演示</h1>
      <label>
        角色
        <select
          value={actor.role}
          onChange={(event) => onChange({ ...actor, role: event.target.value as Role })}
        >
          {Object.entries(roleLabels).map(([role, label]) => (
            <option key={role} value={role}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        姓名
        <input
          value={actor.id}
          onChange={(event) => onChange({ ...actor, id: event.target.value })}
        />
      </label>
      <button type="button" className="secondary" onClick={onReset}>
        重置演示
      </button>
    </header>
  )
}
