import type { CheckResult, HumanTask } from '@durable-jev/contracts'
import type { RuleDefinition } from '@durable-jev/rule-engine'
import { Background, Controls, type Edge, ReactFlow, useNodesState } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useMemo, useState } from 'react'
import { StatusBadge } from '../StatusBadge.js'
import { layoutFlow } from './flow-layout.js'
import {
  branchLabels,
  buildFlowModel,
  type EdgeState,
  type FlowNodeModel,
  type FlowView,
} from './flow-model.js'
import { describeWaitingOn, RuleFlowNode, type RuleFlowNodeType } from './RuleFlowNode.js'

const nodeTypes = { rule: RuleFlowNode }

const edgeLegend: { state: EdgeState; label: string }[] = [
  { state: 'flowing', label: 'passed — flowing' },
  { state: 'waiting', label: 'stopped at a person' },
  { state: 'blocked', label: 'blocked upstream' },
  { state: 'failed', label: 'failed' },
]

export function FlowDiagram(props: {
  rules: RuleDefinition[]
  checks: CheckResult[]
  humanTasks: HumanTask[]
}) {
  const [view, setView] = useState<FlowView>({ kind: 'overview' })
  const [showNotApplicable, setShowNotApplicable] = useState(false)
  const [selectedId, setSelectedId] = useState<string>()

  const model = useMemo(
    () =>
      buildFlowModel({
        rootRuleId: 'R40',
        view,
        rules: props.rules,
        checks: props.checks,
        humanTasks: props.humanTasks,
        showNotApplicable,
      }),
    [view, props.rules, props.checks, props.humanTasks, showNotApplicable],
  )
  const positions = useMemo(() => layoutFlow(model), [model])

  const [nodes, setNodes, onNodesChange] = useNodesState<RuleFlowNodeType>([])
  useEffect(() => {
    setNodes((previous) =>
      model.nodes.map((node) => {
        const measured = previous.find((candidate) => candidate.id === node.id)?.measured
        return {
          id: node.id,
          type: 'rule',
          position: positions.get(node.id) ?? { x: 0, y: 0 },
          data: { ...node, selected: node.id === selectedId },
          draggable: false,
          ...(measured === undefined ? {} : { measured }),
        }
      }),
    )
  }, [model, positions, selectedId, setNodes])
  const edges: Edge[] = model.edges.map((edge) => ({
    id: `${edge.from}->${edge.to}`,
    source: edge.from,
    target: edge.to,
    animated: edge.state === 'flowing',
    className: `flow-edge flow-edge-${edge.state}`,
  }))
  const selected = model.nodes.find((node) => node.id === selectedId)

  const openView = (next: FlowView) => {
    setSelectedId(undefined)
    setView(next)
  }

  return (
    <div className="flow">
      <div className="flow-toolbar">
        <nav className="flow-breadcrumb">
          <button
            type="button"
            aria-pressed={view.kind === 'overview'}
            onClick={() => openView({ kind: 'overview' })}
          >
            Overview
          </button>
          {view.kind === 'branch' && <span className="muted">/ {branchLabels[view.branch]}</span>}
          <button
            type="button"
            aria-pressed={view.kind === 'all'}
            onClick={() => openView({ kind: 'all' })}
          >
            All rules
          </button>
        </nav>
        <ul className="flow-legend">
          {edgeLegend.map(({ state, label }) => (
            <li key={state}>
              <svg width="34" height="10" aria-hidden="true" className={`flow-edge-${state}`}>
                <line x1="0" y1="5" x2="34" y2="5" />
              </svg>
              {label}
            </li>
          ))}
        </ul>
        <label className="small">
          <input
            type="checkbox"
            checked={showNotApplicable}
            onChange={(event) => setShowNotApplicable(event.target.checked)}
          />{' '}
          show not applicable
        </label>
      </div>
      <div className="flow-canvas">
        <ReactFlow
          key={`${JSON.stringify(view)}:${model.nodes.map((node) => node.id).join(',')}`}
          nodes={nodes}
          onNodesChange={onNodesChange}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
          minZoom={0.2}
          nodesConnectable={false}
          onNodeClick={(_event, node) => {
            const clicked = model.nodes.find((candidate) => candidate.id === node.id)
            if (clicked?.kind === 'group' && clicked.branch)
              openView({ kind: 'branch', branch: clicked.branch })
            else setSelectedId(node.id)
          }}
          onPaneClick={() => setSelectedId(undefined)}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <p className="muted small">
        {view.kind === 'overview'
          ? 'Click a branch to see its rules. Click a step to see its details.'
          : 'Click a rule to see its result for each cargo item or leg.'}
      </p>
      {selected && <RuleDetails node={selected} />}
    </div>
  )
}

function RuleDetails({ node }: { node: FlowNodeModel }) {
  return (
    <div className="flow-details">
      <strong>{node.id}</strong> <StatusBadge status={node.status} />
      {node.waitingOn.length > 0 && (
        <span className="muted small"> waiting on {describeWaitingOn(node.waitingOn)}</span>
      )}
      <table>
        <tbody>
          {node.checks.map((check) => (
            <tr key={check.checkResultId}>
              <td>{check.subject.entityId}</td>
              <td>
                <StatusBadge status={check.gateStatus} />
              </td>
              <td className="muted small">
                {check.observedValue === undefined ? '' : JSON.stringify(check.observedValue)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
