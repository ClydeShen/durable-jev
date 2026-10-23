import type { HumanTask } from '@durable-jev/contracts'
import type { RuleOutcome } from '@durable-jev/rule-engine'
import { useEffect, useState } from 'react'
import type { AgentNames, AgentStatus, RuleInfo } from '../api'
import type { PlaybackSpeed } from '../playback'
import { useCaseHistory } from '../use-case-history'
import { AgentCard } from './AgentCard'
import { AgentOverview } from './AgentOverview'
import { EventFeed } from './EventFeed'
import { RuleDetail } from './RuleDetail'
import { RuleGraph } from './RuleGraph'
import { Timeline } from './Timeline'

type CaseViewMode = 'overview' | 'graph' | 'timeline'

const viewModes: [CaseViewMode, string][] = [
  ['overview', 'Agent 总览'],
  ['graph', '规则图'],
  ['timeline', '时间线'],
]

interface ViewTabsProps {
  view: CaseViewMode
  onView(view: CaseViewMode): void
  /** The agent the rule graph is narrowed to, if any. */
  focusName?: string
  onClearFocus(): void
}

function ViewTabs({ view, onView, focusName, onClearFocus }: ViewTabsProps) {
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
          仅 {focusName} ✕
        </button>
      )}
    </nav>
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
  ruleRequest,
}: Props) {
  const [view, setView] = useState<CaseViewMode>('overview')
  const [focusAgent, setFocusAgent] = useState<string>()
  const [selectedRule, setSelectedRule] = useState<string>()
  const history = useCaseHistory({ caseId, rules, outcomes, openTasks, speed })
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
      {view === 'overview' && (
        <AgentOverview
          agents={agents}
          rules={rules}
          outcomes={playback.outcomes}
          onOpenAgent={(agentId) => {
            setSelectedRule(undefined)
            onOpenAgent(agentId)
          }}
        />
      )}
      {view === 'graph' && (
        <RuleGraph
          rules={rules}
          agentNames={agentNames}
          outcomes={playback.outcomes}
          playback={playback}
          selectedRule={selectedRule}
          openTasks={openTasks}
          focusRequest={ruleRequest}
          focusAgent={focusAgent}
          onSelect={openRule}
        />
      )}
      {view === 'timeline' && (
        <Timeline entries={history.entries ?? []} agentNames={agentNames} titles={history.titles} />
      )}
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
      <EventFeed
        items={history.feed}
        besideDrawer={Boolean(rule || agentShown)}
        onShowRule={(ruleId) => {
          setView('graph')
          openRule(ruleId)
        }}
      />
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
