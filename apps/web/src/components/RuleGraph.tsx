import type { CheckStatus, HumanTask, Role } from '@durable-jev/contracts'
import type { RuleOutcome } from '@durable-jev/rule-engine'
import {
  Background,
  Controls,
  type Edge,
  Handle,
  MiniMap,
  type Node,
  type NodeProps,
  Panel,
  Position,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react'
import { useEffect, useMemo, useState } from 'react'
import type { AgentNames, RuleInfo } from '../api'
import { layoutGraph, nodeSize, type Positions } from '../graph-layout'
import { checkStatusLabels, kindLabels, mostSevere } from '../labels'
import type { PlaybackStep } from '../playback'
import { useSavedLayout } from '../saved-layout'
import { RoleChip, RoleLabel, StatusBadge, Tag } from './chips'
import { GraphBar, IconButton, LayoutReset } from './ui'

type RuleNodeData = {
  rule: RuleInfo
  ownerName: string
  status?: CheckStatus
  count: number
  invalidatedBy?: string
  boundary: boolean
  /** How the step being played touches this rule, if it does. */
  highlight?: PlaybackStep['tone']
  /** How this rule relates to the selected one: it, one it needs, one that needs it, or neither. */
  relation?: Relation
  /** The roles whose open tasks this rule waits for. */
  waitingFor: Role[]
}

type Relation = 'selected' | 'upstream' | 'downstream' | 'unrelated'

const relationLabels: Partial<Record<Relation, string>> = {
  upstream: 'Upstream',
  downstream: 'Downstream',
}

/** How each rule relates to the selected rule: its direct dependencies and dependents. */
function relationsTo(
  selected: string | undefined,
  shown: readonly { rule: RuleInfo }[],
): Map<string, Relation> {
  const relations = new Map<string, Relation>()
  if (!selected) return relations
  for (const { rule } of shown) {
    if (rule.ruleId === selected) relations.set(rule.ruleId, 'selected')
    else if (rule.dependsOn.includes(selected)) relations.set(rule.ruleId, 'downstream')
    else relations.set(rule.ruleId, 'unrelated')
  }
  const own = shown.find(({ rule }) => rule.ruleId === selected)
  for (const dependency of own?.rule.dependsOn ?? []) relations.set(dependency, 'upstream')
  return relations
}

/** The edge between two rules as the selection sees it: into the selected rule, out of it, or other. */
function edgeClass(source: string, target: string, selected?: string): string | undefined {
  if (!selected) return undefined
  if (target === selected) return 'edge-upstream'
  if (source === selected) return 'edge-downstream'
  return 'edge-dim'
}

function RuleNode({ data }: NodeProps<Node<RuleNodeData>>) {
  const {
    rule,
    ownerName,
    status,
    count,
    invalidatedBy,
    boundary,
    highlight,
    relation,
    waitingFor,
  } = data
  const classes = [
    'rule-node',
    'check-status',
    status ?? 'NONE',
    boundary && 'boundary',
    highlight && `playing ${highlight}`,
    relation && `relation-${relation}`,
  ]
  return (
    <div
      className={classes.filter(Boolean).join(' ')}
      style={nodeSize}
      title={`${rule.ruleId} ${rule.title} (${kindLabels[rule.kind]}, ${ownerName})`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="rule-node-title">
        {relation && relationLabels[relation] && (
          <Tag tone={relation === 'upstream' ? 'upstream' : 'downstream'}>
            {relationLabels[relation]}
          </Tag>
        )}
        <button
          type="button"
          className="node-open"
          aria-label={`${rule.ruleId} ${rule.title}, ${status ? checkStatusLabels[status] : 'not evaluated'}, open details`}
        >
          <strong>{rule.ruleId}</strong> {rule.title}
        </button>
      </div>
      <div className="rule-node-meta">
        {waitingFor.length > 0 ? (
          waitingFor.map((role) => <RoleLabel key={role} forRole={role} prefix="Awaits " />)
        ) : (
          <Tag>{kindLabels[rule.kind]}</Tag>
        )}
        {boundary && <span className="muted">from {ownerName}</span>}
        {invalidatedBy && (
          <span className="invalidated" title={`Decided again after change ${invalidatedBy}`}>
            ↻ {invalidatedBy.split(' ')[0]}
          </span>
        )}
        <StatusBadge status={status} />
        {count > 1 && <span className="muted">×{count}</span>}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

const nodeTypes = { rule: RuleNode }

/** How a rule stands in this case: its most severe status, its scopes, who it waits for. */
function ruleInCase(
  ruleId: string,
  outcomes: readonly RuleOutcome[],
  openTasks: readonly HumanTask[],
): Pick<RuleNodeData, 'status' | 'count' | 'invalidatedBy' | 'waitingFor'> {
  const own = outcomes.filter((outcome) => outcome.ruleId === ruleId)
  return {
    status: mostSevere(own.map((outcome) => outcome.status)),
    count: own.length,
    invalidatedBy: own.find((outcome) => outcome.invalidatedBy)?.invalidatedBy,
    waitingFor: [
      ...new Set(
        openTasks.filter((task) => task.ruleId === ruleId).map((task) => task.requiredRole),
      ),
    ],
  }
}

/** The minimap colours each rule by its status, like units on a game map. */
const minimapClass = (node: Node) => (node.data as RuleNodeData).status ?? 'NONE'

/** Moves the view to some rules: the ones a step touches, or one the presenter asked for. */
function Follow({ ruleIds }: { ruleIds?: readonly string[] }) {
  const { fitView, getNode } = useReactFlow()
  useEffect(() => {
    const nodes = (ruleIds ?? []).filter((id) => getNode(id)).map((id) => ({ id }))
    if (nodes.length > 0) void fitView({ nodes, duration: 600, maxZoom: 0.9, padding: 0.4 })
  }, [ruleIds, fitView, getNode])
  return null
}

function progressLabel(playback: Playback): string {
  if (playback.current?.final) return 'Where it stands'
  return playback.remaining > 0 ? `${playback.remaining} steps to go` : 'Last step'
}

function Narration({ playback }: { playback: Playback }) {
  if (!playback.current) return null
  return (
    <Panel
      position="bottom-center"
      className={`narration ${playback.current.tone}`}
      role="status"
      aria-live="polite"
    >
      <span className="narration-text">
        {playback.current.text}
        {playback.current.roles && playback.current.roles.length > 0 && (
          <span className="chips narration-roles">
            {playback.current.roles.map((role) => (
              <RoleChip key={role} forRole={role} />
            ))}
          </span>
        )}
      </span>
      <span className="narration-progress">{progressLabel(playback)}</span>
      {playback.remaining > 0 && (
        <IconButton icon="skip" label="Skip to the end" onClick={playback.skip} />
      )}
    </Panel>
  )
}

interface Playback {
  current?: PlaybackStep
  remaining: number
  skip(): void
}

interface Props {
  rules: RuleInfo[]
  agentNames: AgentNames
  outcomes: RuleOutcome[]
  focusAgent?: string
  playback: Playback
  /** The rule that is open in the detail panel. */
  selectedRule?: string
  /** The case's open human tasks, to show who a waiting rule waits for. */
  openTasks: readonly HumanTask[]
  /** A request from outside the graph to show a rule, such as a task's rule. */
  focusRequest?: { ruleIds: string[] }
  /** Opens a rule, or clears the selection with undefined. */
  onSelect(ruleId: string | undefined): void
}

/**
 * Extension rules that rule selection filtered out for every scope of this case, as a stable key:
 * sorted, so a new outcome order from the server does not rebuild the graph.
 */
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
  ]
    .sort()
    .join()
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

export function RuleGraph({
  rules,
  agentNames,
  outcomes,
  focusAgent,
  playback,
  selectedRule,
  focusRequest,
  openTasks,
  onSelect,
}: Props) {
  const step = playback.current
  const [positions, setPositions] = useState<Positions>({})
  const filteredKey = filteredRuleIds(outcomes)
  const shown = useMemo(
    () => visibleRules(rules, focusAgent, new Set(filteredKey.split(','))),
    [rules, focusAgent, filteredKey],
  )
  const layout = useSavedLayout(`rules:${focusAgent ?? 'all'}:${filteredKey}`)
  const filteredCount = filteredKey ? filteredKey.split(',').length : 0
  const selectedCount = rules.filter((rule) => rule.extension).length - filteredCount
  useEffect(() => {
    setPositions({})
    void layoutGraph(
      shown.map(({ rule }) => ({ id: rule.ruleId, dependsOn: rule.dependsOn })),
    ).then(setPositions)
  }, [shown])
  const relations = useMemo(() => relationsTo(selectedRule, shown), [selectedRule, shown])
  const nodes = useMemo<Node<RuleNodeData>[]>(
    () =>
      shown.map(({ rule, boundary }) => {
        return {
          id: rule.ruleId,
          type: 'rule',
          // Every rule node has this fixed size; stating it keeps xyflow from hiding a node
          // to measure it again each time its data changes.
          measured: nodeSize,
          // The inner button takes focus, so the node itself is not a second tab stop.
          focusable: false,
          position: layout.moved[rule.ruleId] ?? positions[rule.ruleId] ?? { x: 0, y: 0 },
          data: {
            rule,
            ownerName: agentNames[rule.owner] ?? rule.owner,
            ...ruleInCase(rule.ruleId, outcomes, openTasks),
            boundary,
            highlight: step?.ruleIds.includes(rule.ruleId) ? step.tone : undefined,
            relation: relations.get(rule.ruleId),
          },
          selected: rule.ruleId === selectedRule,
        }
      }),
    [
      shown,
      outcomes,
      positions,
      layout.moved,
      agentNames,
      step,
      selectedRule,
      relations,
      openTasks,
    ],
  )
  const edges = useMemo<Edge[]>(
    () =>
      shown.flatMap(({ rule }) =>
        rule.dependsOn.map((dependency) => {
          const active = step?.tone === 'rule' && step.ruleIds.includes(rule.ruleId)
          return {
            id: `${dependency}->${rule.ruleId}`,
            source: dependency,
            target: rule.ruleId,
            animated: active || dependency === selectedRule || rule.ruleId === selectedRule,
            className: active ? 'edge-active' : edgeClass(dependency, rule.ruleId, selectedRule),
          }
        }),
      ),
    [shown, step, selectedRule],
  )
  // With a rule open, the detail drawer covers the right side; the graph uses what is left.
  const className = selectedRule ? 'rule-graph beside-drawer' : 'rule-graph'
  if (Object.keys(positions).length === 0) return <div className={className} />
  return (
    <div className={className}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_event, node) => onSelect(node.id)}
        onPaneClick={() => onSelect(undefined)}
        onNodesChange={layout.onNodesChange}
        fitView
        minZoom={0.2}
      >
        <Background />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeClassName={minimapClass} ariaLabel="Rule graph overview" />
        <Follow ruleIds={step?.ruleIds} />
        <Follow ruleIds={focusRequest?.ruleIds} />
        <Narration playback={playback} />
        <GraphBar>
          {filteredCount > 0 && (
            <span
              className="graph-bar-group"
              title={`Of ${selectedCount + filteredCount} destination and customer-specific rules`}
            >
              <span className="stat-label">Specific rules</span>
              <Tag tone="highlight">{selectedCount} apply to this order</Tag>
            </span>
          )}
        </GraphBar>
        <LayoutReset moved={Object.keys(layout.moved).length > 0} onReset={layout.reset} />
      </ReactFlow>
    </div>
  )
}
