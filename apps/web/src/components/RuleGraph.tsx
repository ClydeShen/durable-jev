import type { CheckStatus } from '@durable-jev/contracts'
import type { RuleOutcome } from '@durable-jev/rule-engine'
import {
  Background,
  Controls,
  type Edge,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
} from '@xyflow/react'
import { useEffect, useMemo, useState } from 'react'
import type { RuleInfo } from '../api'
import { layoutGraph, nodeSize, type Positions } from '../graph-layout'
import { agentLabels, checkStatusLabels, kindLabels, mostSevere } from '../labels'

type RuleNodeData = {
  rule: RuleInfo
  status?: CheckStatus
  count: number
  invalidatedBy?: string
  boundary: boolean
}

function RuleNode({ data }: NodeProps<Node<RuleNodeData>>) {
  const { rule, status, count, invalidatedBy, boundary } = data
  return (
    <div
      className={`rule-node check-status ${status ?? 'NONE'}${boundary ? ' boundary' : ''}`}
      style={nodeSize}
    >
      <Handle type="target" position={Position.Left} />
      <div className="rule-node-title">
        <strong>{rule.ruleId}</strong> {rule.title}
        {invalidatedBy && (
          <span className="invalidated" title={`因变更 ${invalidatedBy} 重算`}>
            {' '}
            ↻{invalidatedBy.split(' ')[0]}
          </span>
        )}
      </div>
      <div className="rule-node-meta">
        <span>{kindLabels[rule.kind]}</span>
        <span>
          {boundary ? '→ ' : ''}
          {agentLabels[rule.owner] ?? rule.owner}
        </span>
        <span>
          {status ? checkStatusLabels[status] : '未评估'}
          {count > 1 ? ` ×${count}` : ''}
        </span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

const nodeTypes = { rule: RuleNode }

interface Props {
  rules: RuleInfo[]
  outcomes: RuleOutcome[]
  focusAgent?: string
  onSelect(ruleId: string): void
}

function visibleRules(rules: readonly RuleInfo[], focusAgent: string | undefined) {
  if (!focusAgent) return rules.map((rule) => ({ rule, boundary: false }))
  const owned = rules.filter((rule) => rule.owner === focusAgent)
  const needed = new Set(owned.flatMap((rule) => rule.dependsOn))
  const boundary = rules.filter((rule) => rule.owner !== focusAgent && needed.has(rule.ruleId))
  return [
    ...owned.map((rule) => ({ rule, boundary: false })),
    ...boundary.map((rule) => ({ rule: { ...rule, dependsOn: [] }, boundary: true })),
  ]
}

export function RuleGraph({ rules, outcomes, focusAgent, onSelect }: Props) {
  const [positions, setPositions] = useState<Positions>({})
  const shown = useMemo(() => visibleRules(rules, focusAgent), [rules, focusAgent])
  useEffect(() => {
    setPositions({})
    layoutGraph(shown.map(({ rule }) => ({ id: rule.ruleId, dependsOn: rule.dependsOn }))).then(
      setPositions,
    )
  }, [shown])
  const nodes = useMemo<Node<RuleNodeData>[]>(
    () =>
      shown.map(({ rule, boundary }) => {
        const own = outcomes.filter((outcome) => outcome.ruleId === rule.ruleId)
        return {
          id: rule.ruleId,
          type: 'rule',
          position: positions[rule.ruleId] ?? { x: 0, y: 0 },
          data: {
            rule,
            status: mostSevere(own.map((outcome) => outcome.status)),
            count: own.length,
            invalidatedBy: own.find((outcome) => outcome.invalidatedBy)?.invalidatedBy,
            boundary,
          },
        }
      }),
    [shown, outcomes, positions],
  )
  const edges = useMemo<Edge[]>(
    () =>
      shown.flatMap(({ rule }) =>
        rule.dependsOn.map((dependency) => ({
          id: `${dependency}->${rule.ruleId}`,
          source: dependency,
          target: rule.ruleId,
        })),
      ),
    [shown],
  )
  if (Object.keys(positions).length === 0) return <div className="rule-graph" />
  return (
    <div className="rule-graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_event, node) => onSelect(node.id)}
        nodesDraggable={false}
        fitView
        minZoom={0.2}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
