import type { CheckStatus } from '@durable-jev/contracts'
import type { RuleOutcome } from '@durable-jev/rule-engine'
import {
  Background,
  Controls,
  type Edge,
  Handle,
  type Node,
  type NodeProps,
  Panel,
  Position,
  ReactFlow,
} from '@xyflow/react'
import { useEffect, useMemo, useState } from 'react'
import type { AgentNames, RuleInfo } from '../api'
import { layoutGraph, nodeSize, type Positions } from '../graph-layout'
import { checkStatusLabels, kindLabels, mostSevere } from '../labels'

type RuleNodeData = {
  rule: RuleInfo
  ownerName: string
  status?: CheckStatus
  count: number
  invalidatedBy?: string
  boundary: boolean
}

function RuleNode({ data }: NodeProps<Node<RuleNodeData>>) {
  const { rule, ownerName, status, count, invalidatedBy, boundary } = data
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
          {ownerName}
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
  agentNames: AgentNames
  outcomes: RuleOutcome[]
  focusAgent?: string
  onSelect(ruleId: string): void
}

/** Extension rules that rule selection filtered out for every scope of this case. */
function filteredRuleIds(outcomes: readonly RuleOutcome[]): string {
  const kept = new Set(
    outcomes.filter((outcome) => !outcome.filtered).map((outcome) => outcome.ruleId),
  )
  return [
    ...new Set(
      outcomes
        .filter((outcome) => outcome.filtered && !kept.has(outcome.ruleId))
        .map((outcome) => outcome.ruleId),
    ),
  ].join()
}

function visibleRules(
  allRules: readonly RuleInfo[],
  focusAgent: string | undefined,
  filtered: ReadonlySet<string>,
) {
  const rules = allRules
    .filter((rule) => !filtered.has(rule.ruleId))
    .map((rule) => ({
      ...rule,
      dependsOn: rule.dependsOn.filter((dependency) => !filtered.has(dependency)),
    }))
  if (!focusAgent) return rules.map((rule) => ({ rule, boundary: false }))
  const owned = rules.filter((rule) => rule.owner === focusAgent)
  const needed = new Set(owned.flatMap((rule) => rule.dependsOn))
  const boundary = rules.filter((rule) => rule.owner !== focusAgent && needed.has(rule.ruleId))
  return [
    ...owned.map((rule) => ({ rule, boundary: false })),
    ...boundary.map((rule) => ({ rule: { ...rule, dependsOn: [] }, boundary: true })),
  ]
}

export function RuleGraph({ rules, agentNames, outcomes, focusAgent, onSelect }: Props) {
  const [positions, setPositions] = useState<Positions>({})
  const filteredKey = filteredRuleIds(outcomes)
  const shown = useMemo(
    () => visibleRules(rules, focusAgent, new Set(filteredKey.split(','))),
    [rules, focusAgent, filteredKey],
  )
  const filteredCount = filteredKey ? filteredKey.split(',').length : 0
  const selectedCount = rules.filter((rule) => rule.extension).length - filteredCount
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
            ownerName: agentNames[rule.owner] ?? rule.owner,
            status: mostSevere(own.map((outcome) => outcome.status)),
            count: own.length,
            invalidatedBy: own.find((outcome) => outcome.invalidatedBy)?.invalidatedBy,
            boundary,
          },
        }
      }),
    [shown, outcomes, positions, agentNames],
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
        {filteredCount > 0 && (
          <Panel position="top-left" className="graph-hint">
            扩展规则：本单命中 {selectedCount} 条 · 已按目的地、客户与货物分类筛掉 {filteredCount}{' '}
            条
          </Panel>
        )}
      </ReactFlow>
    </div>
  )
}
