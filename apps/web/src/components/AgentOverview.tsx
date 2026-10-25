import type { CheckStatus } from '@durable-jev/contracts'
import type { RuleOutcome } from '@durable-jev/rule-engine'
import {
  Background,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
} from '@xyflow/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { agentRelations } from '../agent-relations'
import type { AgentStatus, RuleInfo } from '../api'
import { layoutGraph, type Positions } from '../graph-layout'
import { kindLabels, mostSevere } from '../labels'
import { useSavedLayout } from '../saved-layout'
import { StatusBadge, Tag } from './chips'
import { GraphBar, LayoutReset } from './ui'

const agentNodeSize = { width: 280, height: 170 }

type AgentNodeData = { agent: AgentStatus; caseStatus?: CheckStatus }

function AgentNode({ data }: NodeProps<Node<AgentNodeData>>) {
  const { agent, caseStatus } = data
  const summary = agent.summary
  const openTasks = Object.values(summary?.openTasksByRole ?? {}).reduce<number>(
    (sum, count) => sum + (count ?? 0),
    0,
  )
  return (
    <div className={`agent-node check-status ${caseStatus ?? 'NONE'}`} style={agentNodeSize}>
      <Handle type="target" position={Position.Left} />
      <header>
        <span className={agent.available ? 'dot online' : 'dot offline'} />
        <button
          type="button"
          className="node-open"
          aria-label={`${agent.card?.name ?? agent.agentId}, open its card`}
        >
          <strong>{agent.card?.name ?? agent.agentId}</strong>
        </button>
        <StatusBadge status={caseStatus} />
      </header>
      <p>{agent.card?.description}</p>
      {summary ? (
        <footer>
          <span className="chips">
            {Object.entries(summary.rulesByKind).map(([kind, count]) => (
              <Tag key={kind}>
                {kindLabels[kind as keyof typeof kindLabels]} {count}
              </Tag>
            ))}
          </span>
          <span className="agent-node-stats">
            <span>
              Open tasks <strong>{openTasks}</strong>
            </span>
            {agent.transport === 'a2a' && agent.agentId !== 'order-coordination' && (
              <span>
                A2A tasks <strong>{agent.a2aTasks}</strong>
              </span>
            )}
          </span>
        </footer>
      ) : (
        <p className="muted">Offline</p>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

const nodeTypes = { agent: AgentNode }

interface Props {
  agents: AgentStatus[]
  rules: RuleInfo[]
  outcomes?: RuleOutcome[]
  onOpenAgent(agentId: string): void
  onShowRules(agentId: string): void
}

/** Defer pointer clicks so the details drawer cannot cover the second click of a double-click. */
function useAgentNavigation({
  onOpenAgent,
  onShowRules,
}: Pick<Props, 'onOpenAgent' | 'onShowRules'>) {
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(pending.current), [])
  return {
    onNodeClick: (event: React.MouseEvent, node: Node) => {
      clearTimeout(pending.current)
      if (event.detail === 0) onOpenAgent(node.id)
      else pending.current = setTimeout(() => onOpenAgent(node.id), 350)
    },
    onNodeDoubleClick: (_event: React.MouseEvent, node: Node) => {
      clearTimeout(pending.current)
      onShowRules(node.id)
    },
  }
}

export function AgentOverview({ agents, rules, outcomes, onOpenAgent, onShowRules }: Props) {
  const navigation = useAgentNavigation({ onOpenAgent, onShowRules })
  const relations = useMemo(() => agentRelations(rules), [rules])
  const [positions, setPositions] = useState<Positions>({})
  const layout = useSavedLayout('agents')
  const agentIds = agents.map((agent) => agent.agentId).join()
  useEffect(() => {
    const ids = agentIds.split(',')
    void layoutGraph(
      ids.map((id) => ({
        id,
        dependsOn: relations
          .filter((relation) => relation.to === id)
          .map((relation) => relation.from),
      })),
      agentNodeSize,
    ).then(setPositions)
  }, [agentIds, relations])
  const owners = useMemo(() => new Map(rules.map((rule) => [rule.ruleId, rule.owner])), [rules])
  const nodes = useMemo<Node<AgentNodeData>[]>(
    () =>
      agents.map((agent) => ({
        id: agent.agentId,
        type: 'agent',
        measured: agentNodeSize,
        focusable: false,
        position: layout.moved[agent.agentId] ?? positions[agent.agentId] ?? { x: 0, y: 0 },
        data: {
          agent,
          caseStatus: outcomes
            ? mostSevere(
                outcomes
                  .filter((outcome) => owners.get(outcome.ruleId) === agent.agentId)
                  .map((outcome) => outcome.status),
              )
            : undefined,
        },
      })),
    [agents, positions, layout.moved, outcomes, owners],
  )
  const edges = useMemo<Edge[]>(
    () =>
      relations.map((relation) => ({
        id: `${relation.from}->${relation.to}`,
        source: relation.from,
        target: relation.to,
        label: String(relation.dependencies.length),
        markerEnd: { type: MarkerType.ArrowClosed },
      })),
    [relations],
  )
  if (Object.keys(positions).length === 0) return <div className="rule-graph" />
  return (
    <div className="rule-graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        {...navigation}
        onNodesChange={layout.onNodesChange}
        zoomOnDoubleClick={false}
        fitView
      >
        <Background />
        <GraphBar>
          <Tag>Transport: {agents[0]?.transport === 'a2a' ? 'A2A' : 'native HTTP'}</Tag>
        </GraphBar>
        <LayoutReset moved={Object.keys(layout.moved).length > 0} onReset={layout.reset} />
      </ReactFlow>
    </div>
  )
}
