import type { HumanTask } from '@durable-jev/contracts'
import type { RuleOutcome } from '@durable-jev/rule-engine'
import { useCallback, useMemo } from 'react'
import { api, type RuleInfo } from './api'
import { type PlaybackSpeed, whereItStands } from './playback'
import { usePlayback } from './use-playback'
import { usePolling } from './use-polling'

interface Options {
  caseId: string
  rules: readonly RuleInfo[]
  outcomes: readonly RuleOutcome[]
  openTasks: readonly HumanTask[]
  speed: PlaybackSpeed
}

/** A case's timeline, polled, and the playback of what is new in it. */
export function useCaseHistory({ caseId, rules, outcomes, openTasks, speed }: Options) {
  const loadTimeline = useCallback(
    async () => ({ caseId, entries: await api.timeline(caseId) }),
    [caseId],
  )
  const timeline = usePolling(loadTimeline)
  const entries = timeline.data?.caseId === caseId ? timeline.data.entries : undefined
  const titles = useMemo(() => new Map(rules.map((rule) => [rule.ruleId, rule.title])), [rules])
  const finale = useMemo(() => whereItStands(outcomes, openTasks), [outcomes, openTasks])
  const playback = usePlayback({ caseId, entries, outcomes, speed, titles, finale })
  return { entries, titles, playback }
}
