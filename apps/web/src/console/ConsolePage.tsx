import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../icons.js'
import { type ConsoleLocation, type ConsoleTab, formatConsoleLocation } from '../location-state.js'
import { CallTree } from './CallTree.js'
import { CaseTable } from './CaseTable.js'
import { type CaseSummary, formatDuration, isRecoveryEvent } from './console-model.js'
import { JudgementDetail } from './JudgementDetail.js'
import { type CaseDetail, observeApi } from './observe-api.js'
import { RecoveryDetail } from './RecoveryDetail.js'
import { Timeline } from './Timeline.js'

const refreshIntervalMs = 2000

const tabs: { id: ConsoleTab; label: string }[] = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'calls', label: 'Calls' },
  { id: 'judgements', label: 'Judgements' },
  { id: 'recovery', label: 'Recovery' },
]

export function ConsolePage(props: {
  location: ConsoleLocation
  navigate: (hash: string) => void
}) {
  const { location } = props
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [detail, setDetail] = useState<CaseDetail>()
  const [problem, setProblem] = useState<string>()

  const refresh = useCallback(async () => {
    try {
      setCases((await observeApi.cases()).cases)
      setDetail(
        location.correlationId ? await observeApi.caseDetail(location.correlationId) : undefined,
      )
      setProblem(undefined)
    } catch (error) {
      setProblem(
        `Cannot reach the observation service (${String(error)}). The workbench keeps working without it.`,
      )
    }
  }, [location.correlationId])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, refreshIntervalMs)
    return () => clearInterval(timer)
  }, [refresh])

  const go = (next: Partial<ConsoleLocation>) =>
    props.navigate(formatConsoleLocation({ ...location, ...next }))

  return (
    <main className="content console">
      {problem && (
        <div className="message message-error" role="status">
          {problem}
        </div>
      )}
      {!location.correlationId ? (
        <CaseTable
          cases={cases}
          onOpen={(correlationId) => props.navigate(formatConsoleLocation({ correlationId }))}
        />
      ) : (
        <>
          <div className="case-header">
            <button type="button" onClick={() => props.navigate(formatConsoleLocation({}))}>
              <Icon name="route" size={12} /> All cases
            </button>
            <h2>{detail?.summary.caseId ?? location.correlationId}</h2>
            <span className="muted small">{location.correlationId}</span>
            {detail?.summary.caseId && (
              <a
                className="link-button small"
                href={`#/cases/${encodeURIComponent(detail.summary.caseId)}`}
              >
                <Icon name="workbench" size={12} /> Open in workbench
              </a>
            )}
          </div>
          {detail ? (
            <>
              <SummaryTiles
                summary={detail.summary}
                recoveries={detail.events.filter(({ event }) => isRecoveryEvent(event)).length}
              />
              <div className="view-tabs" role="tablist">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={location.tab === tab.id}
                    onClick={() => go({ tab: tab.id })}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {location.tab === 'timeline' && (
                <Timeline
                  events={detail.events}
                  highlightRule={location.rule}
                  onOpenTrace={(trace) => go({ tab: 'calls', trace })}
                />
              )}
              {location.tab === 'calls' && (
                <CallTree
                  events={detail.events}
                  focusTrace={location.trace}
                  onOpenTrace={(trace) => go({ tab: 'calls', trace })}
                />
              )}
              {location.tab === 'judgements' && (
                <JudgementDetail events={detail.events} highlightRule={location.rule} />
              )}
              {location.tab === 'recovery' && (
                <RecoveryDetail
                  events={detail.events}
                  onOpenTrace={(trace) => go({ tab: 'calls', trace })}
                />
              )}
            </>
          ) : (
            !problem && <p className="muted">Loading this case</p>
          )}
        </>
      )}
    </main>
  )
}

function SummaryTiles(props: { summary: CaseSummary; recoveries: number }) {
  const { summary } = props
  const tiles: { label: string; value: string; hint?: string }[] = [
    { label: 'Total', value: formatDuration(summary.totalMs), hint: 'First to last event' },
    {
      label: 'Machine time',
      value: formatDuration(summary.machineMs),
      hint: 'Parallel calls count once',
    },
    {
      label: 'Waiting for people',
      value: formatDuration(summary.humanWaitMs),
      hint: 'Not machine time',
    },
    { label: 'Events', value: String(summary.eventCount) },
    { label: 'Errors', value: String(summary.errorCount) },
    { label: 'Recoveries', value: String(props.recoveries) },
  ]
  return (
    <dl className="tiles">
      {tiles.map((tile) => (
        <div key={tile.label} className="tile" title={tile.hint}>
          <dt>{tile.label}</dt>
          <dd>{tile.value}</dd>
        </div>
      ))}
    </dl>
  )
}
