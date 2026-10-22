import type { CheckStatus } from '@durable-jev/contracts'
import type { RuleOutcome } from '@durable-jev/rule-engine'
import {
  Background,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Panel,
  Position,
  ReactFlow,
} from '@xyflow/react'
import { useEffect, useMemo, useState } from 'react'
import { agentRelations } from '../agent-relations'
import type { AgentStatus, RuleInfo } from '../api'
import { layoutGraph, type Positions } from '../graph-layout'
import { checkStatusLabels, kindLabels, mostSevere, roleLabels } from '../labels'

const agentNodeSize = { width: 280, height: 170 }

type AgentNodeData = { agent: AgentStatus; caseStatus?: CheckStatus }

function AgentNode({ data }: NodeProps<Node<AgentNodeData>>) {
  const { agent, caseStatus } = data
  const summary = agent.summary
  return (
    <div className={`agent-node check-status ${caseStatus ?? 'NONE'}`} style={agentNodeSize}>
      <Handle type="target" position={Position.Left} />
      <header>
        <span className={agent.available ? 'dot online' : 'dot offline'} />
        <strong>{agent.card?.name ?? agent.agentId}</strong>
        {caseStatus && <span className="agent-case-status">{checkStatusLabels[caseStatus]}</span>}
      </header>
      <p>{agent.card?.description}</p>
      {summary ? (
        <>
          <p className="agent-meta">
            规则：
            {Object.entries(summary.rulesByKind)
              .map(([kind, count]) => `${kindLabels[kind as keyof typeof kindLabels]} ${count}`)
              .join(' · ')}
          </p>
          <p className="agent-meta">
            案例 {summary.cases} · 待办{' '}
            {Object.entries(summary.openTasksByRole)
              .map(([role, count]) => `${roleLabels[role as keyof typeof roleLabels]} ${count}`)
              .join('、') || '无'}
          </p>
          {agent.transport === 'a2a' && agent.agentId !== 'order-coordination' && (
            <p className="agent-meta">A2A 任务 {agent.a2aTasks}</p>
          )}
        </>
      ) : (
        <p className="agent-meta">离线</p>
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
}

export function AgentOverview({ agents, rules, outcomes, onOpenAgent }: Props) {
  const relations = useMemo(() => agentRelations(rules), [rules])
  const [positions, setPositions] = useState<Positions>({})
  const agentIds = agents.map((agent) => agent.agentId).join()
  useEffect(() => {
    const ids = agentIds.split(',')
    layoutGraph(
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
        position: positions[agent.agentId] ?? { x: 0, y: 0 },
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
    [agents, positions, outcomes, owners],
  )
  const edges = useMemo<Edge[]>(
    () =>
      relations.map((relation) => ({
        id: `${relation.from}->${relation.to}`,
        source: relation.from,
        target: relation.to,
        label: `${relation.dependencies.length} 条依赖`,
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
        onNodeClick={(_event, node) => onOpenAgent(node.id)}
        zoomOnDoubleClick={false}
        nodesDraggable={false}
        fitView
      >
        <Background />
        <Panel position="top-left" className="graph-hint">
          点击 agent 查看其内部规则；连线是跨 agent 的规则依赖 · 通信：
          {agents[0]?.transport === 'a2a' ? 'A2A' : '原生 HTTP'}
        </Panel>
      </ReactFlow>
    </div>
  )
}
