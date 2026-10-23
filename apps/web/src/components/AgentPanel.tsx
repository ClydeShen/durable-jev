import type { AgentStatus } from '../api'

interface Props {
  agents: AgentStatus[]
  canControl: boolean
  onOpen(agentId: string): void
  onControl(agentId: string, verb: 'crash' | 'start'): void
}

export function AgentPanel({ agents, canControl, onOpen, onControl }: Props) {
  return (
    <section className="agent-panel">
      <h2>Agents</h2>
      <ul>
        {agents.map((agent) => (
          <li key={agent.agentId}>
            <button type="button" className="agent-link" onClick={() => onOpen(agent.agentId)}>
              <span className={agent.available ? 'dot online' : 'dot offline'} />
              <span>
                <strong>{agent.card?.name ?? agent.agentId}</strong>
                <small>{agent.available ? agent.card?.description : '离线'}</small>
              </span>
            </button>
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
