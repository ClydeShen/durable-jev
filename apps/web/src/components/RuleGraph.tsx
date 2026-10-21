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

type RuleNodeData = { rule: RuleInfo; status?: CheckStatus; count: number }

function RuleNode({ data }: NodeProps<Node<RuleNodeData>>) {
  const { rule, status, count } = data
  return (
    <div className={`rule-node check-status ${status ?? 'NONE'}`} style={nodeSize}>
      <Handle type="target" position={Position.Left} />
      <div className="rule-node-title">
        <strong>{rule.ruleId}</strong> {rule.title}
      </div>
      <div className="rule-node-meta">
        <span>{kindLabels[rule.kind]}</span>
        <span>{agentLabels[rule.owner] ?? rule.owner}</span>
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
  onSelect(ruleId: string): void
}

export function RuleGraph({ rules, outcomes, onSelect }: Props) {
  const [positions, setPositions] = useState<Positions>({})
  useEffect(() => {
    layoutGraph(rules.map((rule) => ({ id: rule.ruleId, dependsOn: rule.dependsOn }))).then(
      setPositions,
    )
  }, [rules])
  const nodes = useMemo<Node<RuleNodeData>[]>(
    () =>
      rules.map((rule) => {
        const own = outcomes.filter((outcome) => outcome.ruleId === rule.ruleId)
        return {
          id: rule.ruleId,
          type: 'rule',
          position: positions[rule.ruleId] ?? { x: 0, y: 0 },
          data: {
            rule,
            status: mostSevere(own.map((outcome) => outcome.status)),
            count: own.length,
          },
        }
      }),
    [rules, outcomes, positions],
  )
  const edges = useMemo<Edge[]>(
    () =>
      rules.flatMap((rule) =>
        rule.dependsOn.map((dependency) => ({
          id: `${dependency}->${rule.ruleId}`,
          source: dependency,
          target: rule.ruleId,
        })),
      ),
    [rules],
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
