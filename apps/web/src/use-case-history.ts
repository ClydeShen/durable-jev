import type { HumanTask } from '@durable-jev/contracts'
import type { RuleOutcome } from '@durable-jev/rule-engine'
import { useCallback, useMemo } from 'react'
import { api, type RuleInfo } from './api'
import { type PlaybackSpeed, whereItStands } from './playback'
import { useEventFeed } from './use-event-feed'
import { usePlayback } from './use-playback'
import { usePolling } from './use-polling'

interface Options {
  caseId: string
  rules: readonly RuleInfo[]
  outcomes: readonly RuleOutcome[]
  openTasks: readonly HumanTask[]
  speed: PlaybackSpeed
  /** Set when the case was just submitted or reset: this run plays from its first event. */
  replayRun?: string
}

/** A case's timeline, polled, the playback of what is new in it, and its event feed. */
export function useCaseHistory({ caseId, rules, outcomes, openTasks, speed, replayRun }: Options) {
  // A timeline fetched before a reset belongs to the earlier run and is not played.
  const run = replayRun ?? caseId
  const loadTimeline = useCallback(
    async () => ({ run, entries: await api.timeline(caseId) }),
    [caseId, run],
  )
  const timeline = usePolling(loadTimeline)
  const entries = timeline.data?.run === run ? timeline.data.entries : undefined
  const titles = useMemo(() => new Map(rules.map((rule) => [rule.ruleId, rule.title])), [rules])
  const finale = useMemo(() => whereItStands(outcomes, openTasks), [outcomes, openTasks])
  const playback = usePlayback({
    caseId,
    entries,
    outcomes,
    speed,
    titles,
    finale,
    replayRun,
  })
  const feed = useEventFeed({ caseId, entries, titles, speed, current: playback.current })
  return { entries, titles, playback, feed }
}
