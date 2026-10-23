import type { AgentStatus, CaseSummary } from '../api'
import type { PlaybackSpeed } from '../playback'
import { AgentPanel } from './AgentPanel'
import { CaseList } from './CaseList'
import { PlaybackControl } from './PlaybackControl'

interface Props {
  speed: PlaybackSpeed
  onSpeed(speed: PlaybackSpeed): void
  cases: CaseSummary[]
  selectedCase?: string
  onSelectCase(caseId: string): void
  agents: AgentStatus[]
  canControl: boolean
  onOpenAgent(agentId: string): void
  onControl(agentId: string, verb: 'crash' | 'start'): void
}

/** The left column: animation speed, the cases, the agents. */
export function Sidebar(props: Props) {
  return (
    <aside className="sidebar">
      <PlaybackControl speed={props.speed} onChange={props.onSpeed} />
      <CaseList cases={props.cases} selected={props.selectedCase} onSelect={props.onSelectCase} />
      <AgentPanel
        agents={props.agents}
        canControl={props.canControl}
        onOpen={props.onOpenAgent}
        onControl={props.onControl}
      />
    </aside>
  )
}
