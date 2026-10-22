import type { RuleOutcome } from '@durable-jev/rule-engine'
import { useCallback, useState } from 'react'
import { type AgentNames, type AgentStatus, api, type RuleInfo } from '../api'
import { usePolling } from '../use-polling'
import { AgentOverview } from './AgentOverview'
import { RuleDetail } from './RuleDetail'
import { RuleGraph } from './RuleGraph'
import { Timeline } from './Timeline'

type CaseViewMode = 'overview' | 'graph' | 'timeline'

const viewModes: [CaseViewMode, string][] = [
  ['overview', 'Agent 总览'],
  ['graph', '规则图'],
  ['timeline', '时间线'],
]

interface Props {
  caseId: string
  outcomes: RuleOutcome[]
  agents: AgentStatus[]
  agentNames: AgentNames
  rules: RuleInfo[]
}

/** The three views of one case: agents, the rule graph (optionally one agent's), the timeline. */
export function CaseViews({ caseId, outcomes, agents, agentNames, rules }: Props) {
  const [view, setView] = useState<CaseViewMode>('overview')
  const [focusAgent, setFocusAgent] = useState<string>()
  const [selectedRule, setSelectedRule] = useState<string>()
  const loadTimeline = useCallback(
    () => (view === 'timeline' ? api.timeline(caseId) : Promise.resolve([])),
    [caseId, view],
  )
  const timeline = usePolling(loadTimeline)
  const rule = rules.find((candidate) => candidate.ruleId === selectedRule)
  return (
    <>
      <nav className="view-tabs">
        {viewModes.map(([mode, label]) => (
          <button
            type="button"
            key={mode}
            className={view === mode ? '' : 'secondary'}
            onClick={() => setView(mode)}
          >
            {label}
          </button>
        ))}
        {view === 'graph' && focusAgent && (
          <button type="button" className="secondary" onClick={() => setFocusAgent(undefined)}>
            仅 {agentNames[focusAgent] ?? focusAgent} ✕
          </button>
        )}
      </nav>
      {view === 'overview' && (
        <AgentOverview
          agents={agents}
          rules={rules}
          outcomes={outcomes}
          onOpenAgent={(agentId) => {
            setFocusAgent(agentId)
            setView('graph')
          }}
        />
      )}
      {view === 'graph' && (
        <RuleGraph
          rules={rules}
          agentNames={agentNames}
          outcomes={outcomes}
          focusAgent={focusAgent}
          onSelect={setSelectedRule}
        />
      )}
      {view === 'timeline' && <Timeline entries={timeline.data ?? []} agentNames={agentNames} />}
      {rule && (
        <RuleDetail
          rule={rule}
          agentNames={agentNames}
          outcomes={outcomes.filter((outcome) => outcome.ruleId === rule.ruleId)}
          onClose={() => setSelectedRule(undefined)}
        />
      )}
    </>
  )
}
