import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../icons.component.js'
import { type ConsoleLocation, type ConsoleTab, formatConsoleLocation } from '../location.model.js'
import { CallTree } from './call-tree.view.js'
import { CaseTable } from './case-table.view.js'
import { type CaseSummary, formatDuration, isRecoveryEvent } from './console.model.js'
import { JudgementDetail } from './judgement-detail.view.js'
import { type CaseDetail, observeApi } from './observe.client.js'
import {
  mergeStored,
  openEventStream,
  reconcileSnapshot,
  type StreamState,
} from './observe-stream.client.js'
import { RecoveryDetail } from './recovery-detail.view.js'
import { Timeline } from './timeline.view.js'

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
  const [stream, setStream] = useState<StreamState>('connecting')
  const { correlationId } = location

  // The list and the summary tiles are small snapshots; events themselves arrive on the stream.
  const loadCases = useCallback(async () => {
    try {
      const { cases: latestCases, latest } = await observeApi.cases()
      setCases(latestCases)
      setProblem(undefined)
      return latest
    } catch (error) {
      setProblem(
        `Cannot reach the observation service (${String(error)}). The workbench keeps working without it.`,
      )
      return 0
    }
  }, [])

  useEffect(() => {
    if (correlationId) return
    let closeStream = () => {}
    let timer: ReturnType<typeof setTimeout> | undefined
    let alive = true
    loadCases().then((latest) => {
      if (!alive) return
      closeStream = openEventStream({
        after: latest,
        onState: setStream,
        // Many events arrive together: refresh the list once they settle.
        onEvents: () => {
          clearTimeout(timer)
          timer = setTimeout(loadCases, 300)
        },
      })
    })
    return () => {
      alive = false
      clearTimeout(timer)
      closeStream()
    }
  }, [correlationId, loadCases])

  useEffect(() => {
    if (!correlationId) {
      setDetail(undefined)
      return
    }
    // Another case was chosen: show nothing of the previous one while this one loads.
    setDetail(undefined)
    let closeStream = () => {}
    let timer: ReturnType<typeof setTimeout> | undefined
    let alive = true
    let wasInterrupted = false
    const snapshot = async () => {
      try {
        const fresh = await observeApi.caseDetail(correlationId)
        if (!alive) return
        setProblem(undefined)
        setDetail((current) => reconcileSnapshot(current, fresh))
        return fresh.latest
      } catch (error) {
        if (alive)
          setProblem(
            `Cannot reach the observation service (${String(error)}). The workbench keeps working without it.`,
          )
        return undefined
      }
    }
    snapshot().then((latest) => {
      if (!alive) return
      closeStream = openEventStream({
        after: latest ?? 0,
        correlationId,
        onState: (state) => {
          setStream(state)
          if (state === 'reconnecting') wasInterrupted = true
          // After a drop the stream replays what was missed; the snapshot also refreshes the totals
          // and catches a collector that was reset in the meantime.
          if (state === 'live' && wasInterrupted) {
            wasInterrupted = false
            snapshot()
          }
        },
        onEvents: (incoming) => {
          setDetail(
            (current) => current && { ...current, events: mergeStored(current.events, incoming) },
          )
          clearTimeout(timer)
          timer = setTimeout(snapshot, 400)
        },
      })
    })
    return () => {
      alive = false
      clearTimeout(timer)
      closeStream()
    }
  }, [correlationId])

  const go = (next: Partial<ConsoleLocation>) =>
    props.navigate(formatConsoleLocation({ ...location, ...next }))

  return (
    <main className="content console">
      <div className={`stream-state stream-${stream}`} role="status">
        <Icon name={stream === 'live' ? 'live' : 'offline'} />{' '}
        {stream === 'live'
          ? 'Live'
          : stream === 'connecting'
            ? 'Connecting'
            : 'Reconnecting, nothing is lost'}
      </div>
      {problem && (
        <div className="message message-error" role="status">
          {problem}
        </div>
      )}
      {!correlationId ? (
        <CaseTable
          cases={cases}
          onOpen={(next) => props.navigate(formatConsoleLocation({ correlationId: next }))}
        />
      ) : (
        <>
          <div className="case-header">
            <button type="button" onClick={() => props.navigate(formatConsoleLocation({}))}>
              <Icon name="route" size={12} /> All cases
            </button>
            <h2>{detail?.summary.caseId ?? correlationId}</h2>
            <span className="muted small">{correlationId}</span>
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
