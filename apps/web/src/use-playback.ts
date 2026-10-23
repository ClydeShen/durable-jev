import type { RuleOutcome } from '@durable-jev/rule-engine'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { TimelineEntry } from './api'
import {
  outcomesAt,
  type PlaybackSpeed,
  type PlaybackStep,
  playbackSteps,
  stepDelayMs,
} from './playback'

interface Options {
  caseId: string
  /** The case's timeline; undefined until it has loaded for this case. */
  entries?: readonly TimelineEntry[]
  outcomes: readonly RuleOutcome[]
  speed: PlaybackSpeed
  titles: ReadonlyMap<string, string>
  /** Where the case stands, shown once the last step has played. */
  finale: PlaybackStep
  /** Plays the case from its first event, as for an order just submitted. */
  fromStart: boolean
}

/**
 * Plays what happens to a case step by step. Events that were already there when the case
 * opened are not replayed, unless it plays from the start; new ones play at the chosen speed, or
 * at once in real time.
 */
export function usePlayback({
  caseId,
  entries,
  outcomes,
  speed,
  titles,
  finale,
  fromStart,
}: Options) {
  const [shown, setShown] = useState<{ caseId: string; upTo: number }>()
  const [current, setCurrent] = useState<PlaybackStep>()
  const last = (entries?.length ?? 0) - 1
  const replay = fromStart && speed !== 'realtime'
  const opened = replay ? -1 : last
  const upTo = shown?.caseId === caseId ? Math.min(shown.upTo, last) : opened

  useEffect(() => {
    if (entries && (shown?.caseId !== caseId || speed === 'realtime')) {
      setShown({ caseId, upTo: replay ? -1 : entries.length - 1 })
      setCurrent(undefined)
    }
  }, [caseId, entries, shown?.caseId, speed, replay])

  const steps = useMemo(
    () => (entries && shown?.caseId === caseId ? playbackSteps(entries, upTo, titles) : []),
    [entries, shown?.caseId, caseId, upTo, titles],
  )
  const next = steps[0]
  // The timeline is fetched again every poll, so the timer keys on the step's position, not on
  // the step object, or every poll would restart it.
  const nextUpTo = next?.upTo
  const latestFinale = useRef(finale)
  latestFinale.current = finale

  // biome-ignore lint/correctness/useExhaustiveDependencies: nextUpTo stands for next, see above
  useEffect(() => {
    if (speed === 'realtime') return
    const timer = setTimeout(
      () => {
        if (next) {
          setShown({ caseId, upTo: next.upTo })
          setCurrent(next)
        } else if (current && !current.final) setCurrent(latestFinale.current)
        else setCurrent(undefined)
      },
      // The closing step stays up longer, to explain where the case stopped.
      (current?.final ? 3 : 1) * (current || !next ? stepDelayMs[speed] : 0),
    )
    return () => clearTimeout(timer)
  }, [nextUpTo, current, speed, caseId])

  return {
    // Before the timeline loads, a case played from the start shows nothing decided yet.
    outcomes: (entries && outcomesAt(entries, upTo, outcomes)) ?? (replay ? [] : [...outcomes]),
    current,
    remaining: steps.length,
    /** Shows the end state now. */
    skip: () => {
      setShown({ caseId, upTo: last })
      setCurrent(undefined)
    },
  }
}
