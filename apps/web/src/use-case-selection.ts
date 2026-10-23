import { useRef, useState } from 'react'

/**
 * Which case is on screen, or the order entry form in its place. A case just submitted or reset
 * is shown next and plays from its first event: each time is a new run of that case.
 */
export function useCaseSelection() {
  const [caseId, setCaseId] = useState<string>()
  const [ordering, setOrdering] = useState(false)
  const [fresh, setFresh] = useState<{ caseId: string; run: number }>()
  const runs = useRef(0)
  const show = (id: string) => {
    setOrdering(false)
    setFresh(undefined)
    setCaseId(id)
  }
  return {
    caseId,
    ordering,
    /** The run to play from its first event, when the case was just submitted or reset. */
    replayRunOf: (id: string) => (fresh?.caseId === id ? `${id}#${fresh.run}` : undefined),
    show,
    /** Shows a case without closing the form; for the first case, before anything is chosen. */
    showFirst: setCaseId,
    openOrderForm: () => setOrdering(true),
    closeOrderForm: () => setOrdering(false),
    showSubmitted: (id: string) => {
      show(id)
      runs.current += 1
      setFresh({ caseId: id, run: runs.current })
    },
  }
}
