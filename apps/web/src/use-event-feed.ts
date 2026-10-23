import { useCallback, useEffect, useRef, useState } from 'react'
import type { TimelineEntry } from './api'
import { checkStatusLabels } from './labels'
import { type PlaybackSpeed, type PlaybackStep, playbackSteps } from './playback'

export interface FeedItem {
  key: number
  step: PlaybackStep
}

/** How long a notification stays before it fades out, and how many show at once. */
const feedLifetimeMs = 5000
const feedLimit = 5

/** A run of rule re-evaluations becomes one notification, so a big change does not flood the feed. */
function condense(steps: readonly PlaybackStep[]): PlaybackStep[] {
  const result: PlaybackStep[] = []
  for (const step of steps) {
    const previous = result.at(-1)
    if (step.tone === 'rule' && previous?.tone === 'rule') {
      previous.ruleIds = [...new Set([...previous.ruleIds, ...step.ruleIds])]
      previous.text = `${previous.ruleIds.length} rules decided`
      previous.status = undefined
    } else result.push({ ...step, ruleIds: [...step.ruleIds] })
  }
  return result.map((step) =>
    step.tone === 'rule' && step.ruleIds.length === 1 && step.status
      ? { ...step, text: `${step.ruleIds[0]}: ${checkStatusLabels[step.status]}` }
      : step,
  )
}

interface Options {
  caseId: string
  entries?: readonly TimelineEntry[]
  titles: ReadonlyMap<string, string>
  speed: PlaybackSpeed
  /** The step the playback is showing; with playback on, the feed follows it. */
  current?: PlaybackStep
}

/**
 * A game-style event feed: each thing that happens to the case appears as a short notification
 * that stacks under the previous ones and fades out. With playback on it follows the playback;
 * in real time it shows new events as they arrive.
 */
export function useEventFeed({ caseId, entries, titles, speed, current }: Options) {
  const [items, setItems] = useState<FeedItem[]>([])
  const seen = useRef<{ caseId: string; upTo: number }>(undefined)
  const nextKey = useRef(0)

  const push = useCallback((steps: readonly PlaybackStep[]) => {
    const added = steps.map((step) => ({ key: nextKey.current++, step }))
    if (added.length === 0) return
    setItems((shown) => [...shown, ...added].slice(-feedLimit))
    setTimeout(() => {
      const keys = new Set(added.map((item) => item.key))
      setItems((shown) => shown.filter((item) => !keys.has(item.key)))
    }, feedLifetimeMs)
  }, [])

  useEffect(() => {
    if (!entries) return
    const last = entries.length - 1
    const before = seen.current
    seen.current = { caseId, upTo: last }
    if (before?.caseId !== caseId) {
      setItems([])
      return
    }
    if (speed === 'realtime' && last > before.upTo) {
      push(condense(playbackSteps(entries, before.upTo, titles)))
    }
  }, [entries, caseId, speed, titles, push])

  useEffect(() => {
    if (current && !current.final) push([current])
  }, [current, push])

  return items
}
