import type { HumanTask } from '@durable-jev/contracts'
import type { RuleOutcome } from '@durable-jev/rule-engine'
import { useEffect, useState } from 'react'
import type { AgentNames, AgentStatus, RuleInfo } from '../api'
import { agentLegend, type Legend, ruleLegend } from '../legend-text'
import type { PlaybackSpeed } from '../playback'
import { useCaseHistory } from '../use-case-history'
import { AgentCard } from './AgentCard'
import { AgentOverview } from './AgentOverview'
import { EventFeed } from './EventFeed'
import { GraphLegend } from './GraphLegend'
import { RuleDetail } from './RuleDetail'
import { RuleGraph } from './RuleGraph'
import { Timeline } from './Timeline'

type CaseViewMode = 'overview' | 'graph' | 'timeline'

const viewModes: [CaseViewMode, string][] = [
  ['overview', 'Agents'],
  ['graph', 'Rule graph'],
  ['timeline', 'Timeline'],
]

interface ViewTabsProps {
  view: CaseViewMode
  onView(view: CaseViewMode): void
  /** The agent the rule graph is narrowed to, if any. */
  focusName?: string
  onClearFocus(): void
}

const legends: Partial<Record<CaseViewMode, Legend>> = {
  overview: agentLegend,
  graph: ruleLegend,
}

function ViewTabs({ view, onView, focusName, onClearFocus }: ViewTabsProps) {
  const legend = legends[view]
  return (
    <nav className="view-tabs">
      {viewModes.map(([mode, label]) => (
        <button
          type="button"
          key={mode}
          className={view === mode ? '' : 'secondary'}
          onClick={() => onView(mode)}
        >
          {label}
        </button>
      ))}
      {focusName && (
        <button type="button" className="secondary" onClick={onClearFocus}>
          Only {focusName} ✕
        </button>
      )}
      {legend && <GraphLegend legend={legend} />}
    </nav>
  )
}

interface ActiveViewProps {
  view: CaseViewMode
  agents: AgentStatus[]
  rules: RuleInfo[]
  agentNames: AgentNames
  history: ReturnType<typeof useCaseHistory>
  selectedRule?: string
  openTasks: HumanTask[]
  ruleRequest?: { ruleIds: string[] }
  focusAgent?: string
  onSelectRule(ruleId: string | undefined): void
  onOpenAgent(agentId: string): void
}

/** The view picked in the tabs, drawn with the case's played-back outcomes. */
function ActiveView({
  view,
  agents,
  rules,
  agentNames,
  history,
  selectedRule,
  openTasks,
  ruleRequest,
  focusAgent,
  onSelectRule,
  onOpenAgent,
}: ActiveViewProps) {
  return (
    <>
      {view === 'overview' && (
        <AgentOverview
          agents={agents}
          rules={rules}
          outcomes={history.playback.outcomes}
          onOpenAgent={onOpenAgent}
        />
      )}
      {view === 'graph' && (
        <RuleGraph
          rules={rules}
          agentNames={agentNames}
          outcomes={history.playback.outcomes}
          playback={history.playback}
          selectedRule={selectedRule}
          openTasks={openTasks}
          focusRequest={ruleRequest}
          focusAgent={focusAgent}
          onSelect={onSelectRule}
        />
      )}
      {view === 'timeline' && (
        <Timeline entries={history.entries ?? []} agentNames={agentNames} titles={history.titles} />
      )}
    </>
  )
}

interface Props {
  caseId: string
  outcomes: RuleOutcome[]
  /** The case's open human tasks: where it waits for people. */
  openTasks: HumanTask[]
  agents: AgentStatus[]
  agentNames: AgentNames
  rules: RuleInfo[]
  /** The agent whose card is open, if any. */
  openAgent?: string
  onOpenAgent(agentId: string | undefined): void
  speed: PlaybackSpeed
  /** Set when the case was just submitted or reset: this run plays from its first event. */
  replayRun?: string
  /** A rule to show, asked for from outside the views (a task's rule). */
  ruleRequest?: { ruleIds: string[] }
}

/** The three views of one case: agents, the rule graph (optionally one agent's), the timeline. */
export function CaseViews({
  caseId,
  outcomes,
  openTasks,
  agents,
  agentNames,
  rules,
  openAgent,
  onOpenAgent,
  speed,
  replayRun,
  ruleRequest,
}: Props) {
  const [view, setView] = useState<CaseViewMode>('overview')
  const [focusAgent, setFocusAgent] = useState<string>()
  const [selectedRule, setSelectedRule] = useState<string>()
  const history = useCaseHistory({ caseId, rules, outcomes, openTasks, speed, replayRun })
  const { playback } = history
  const playing = playback.current !== undefined
  useEffect(() => {
    if (playing) setView((current) => (current === 'overview' ? 'graph' : current))
  }, [playing])
  useEffect(() => {
    const ruleId = ruleRequest?.ruleIds[0]
    if (!ruleId) return
    setFocusAgent(undefined)
    setView('graph')
    setSelectedRule(ruleId)
  }, [ruleRequest])
  const rule = rules.find((candidate) => candidate.ruleId === selectedRule)
  const agentShown = agents.find((agent) => agent.agentId === openAgent)
  const openRule = (ruleId: string | undefined) => {
    onOpenAgent(undefined)
    setSelectedRule(ruleId)
  }
  return (
    <>
      <ViewTabs
        view={view}
        onView={setView}
        focusName={
          view === 'graph' && focusAgent ? (agentNames[focusAgent] ?? focusAgent) : undefined
        }
        onClearFocus={() => setFocusAgent(undefined)}
      />
      {/* Notifications sit over the graph or timeline, never over the case header's controls. */}
      <div className="view-area">
        <ActiveView
          view={view}
          agents={agents}
          rules={rules}
          agentNames={agentNames}
          history={history}
          selectedRule={selectedRule}
          openTasks={openTasks}
          ruleRequest={ruleRequest}
          focusAgent={focusAgent}
          onSelectRule={openRule}
          onOpenAgent={(agentId) => {
            setSelectedRule(undefined)
            onOpenAgent(agentId)
          }}
        />
        <EventFeed
          items={history.feed}
          besideDrawer={Boolean(rule || agentShown)}
          onShowRule={(ruleId) => {
            setView('graph')
            openRule(ruleId)
          }}
        />
      </div>
      {rule && !agentShown && (
        <RuleDetail
          rule={rule}
          rules={rules}
          agentNames={agentNames}
          onOpenRule={openRule}
          outcomes={outcomes.filter((outcome) => outcome.ruleId === rule.ruleId)}
          openTasks={openTasks.filter((task) => task.ruleId === rule.ruleId)}
          onClose={() => setSelectedRule(undefined)}
        />
      )}
      {agentShown && (
        <AgentCard
          agent={agentShown}
          rules={rules}
          agentNames={agentNames}
          outcomes={outcomes}
          onShowRules={() => {
            setFocusAgent(agentShown.agentId)
            setView('graph')
            onOpenAgent(undefined)
          }}
          onClose={() => onOpenAgent(undefined)}
        />
      )}
    </>
  )
}
