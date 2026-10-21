import type { AgentStatus } from '../api'
import { agentLabels } from '../labels'

interface Props {
  agents: AgentStatus[]
  canControl: boolean
  onControl(agentId: string, verb: 'crash' | 'start'): void
}

export function AgentPanel({ agents, canControl, onControl }: Props) {
  return (
    <section className="agent-panel">
      <h2>Agents</h2>
      <ul>
        {agents.map((agent) => (
          <li key={agent.agentId}>
            <span className={agent.available ? 'dot online' : 'dot offline'} />
            {agentLabels[agent.agentId] ?? agent.agentId}
            {canControl && agent.agentId !== 'order-coordination' && (
              <button
                type="button"
                className={agent.available ? 'danger small' : 'small'}
                onClick={() => onControl(agent.agentId, agent.available ? 'crash' : 'start')}
              >
                {agent.available ? '终止' : '重启'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
