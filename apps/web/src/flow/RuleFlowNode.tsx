import type { GateStatus } from '@durable-jev/contracts'
import { Handle, type Node, type NodeProps, Position } from '@xyflow/react'
import { roleLabels } from '../roles.js'
import { StatusBadge } from '../StatusBadge.js'
import type { FlowNodeModel, WaitingOn } from './flow-model.js'

export type RuleFlowNodeData = FlowNodeModel & { selected: boolean }
export type RuleFlowNodeType = Node<RuleFlowNodeData, 'rule'>

const countLabels: Partial<Record<GateStatus, string>> = {
  PASS: 'pass',
  FAIL: 'fail',
  WAITING_HUMAN: 'waiting',
  BLOCKED_DEPENDENCY: 'blocked',
  UNKNOWN: 'unknown',
  NOT_APPLICABLE: 'n/a',
}

const roleLabel = (role: string | undefined) =>
  role ? roleLabels[role as keyof typeof roleLabels] : undefined

export const describeWaitingOn = (waitingOn: readonly WaitingOn[]) =>
  waitingOn.map(({ ruleId, role }) => (role ? `${ruleId} · ${roleLabel(role)}` : ruleId)).join(', ')

export function RuleFlowNode({ data }: NodeProps<RuleFlowNodeType>) {
  const isHuman = data.evaluatorKind === 'humanGate'
  const classNames = [
    'flow-node',
    `flow-node-${data.status.toLowerCase()}`,
    data.kind === 'group' ? 'flow-node-group' : '',
    isHuman ? 'flow-node-human' : '',
    data.selected ? 'flow-node-selected' : '',
  ]
  const counts = Object.entries(data.statusCounts)
    .map(
      ([status, count]) => `${count} ${countLabels[status as GateStatus] ?? status.toLowerCase()}`,
    )
    .join(' · ')
  return (
    <div className={classNames.join(' ')}>
      <Handle type="target" position={Position.Left} />
      <div className="flow-node-header">
        <span className="flow-node-label">{data.label}</span>
        {data.kind === 'rule' && data.label !== data.id && (
          <span className="muted small">{data.id}</span>
        )}
      </div>
      <div className="flow-node-body">
        <StatusBadge status={data.status} />
        {isHuman && data.status === 'WAITING_HUMAN' && (
          <span className="muted small">{roleLabel(data.humanRole)}</span>
        )}
      </div>
      {data.kind === 'group' && data.waitingOn.length > 0 ? (
        <div className="flow-node-note flow-node-waiting">
          waiting on {describeWaitingOn(data.waitingOn)}
        </div>
      ) : (
        data.kind === 'group' && <div className="flow-node-note muted">{counts}</div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
