import { useState } from 'react'

/**
 * Which case is on screen, or the order entry form in its place. An order just submitted is
 * shown next and plays from its first event.
 */
export function useCaseSelection() {
  const [caseId, setCaseId] = useState<string>()
  const [ordering, setOrdering] = useState(false)
  const [fresh, setFresh] = useState<string>()
  const show = (id: string) => {
    setOrdering(false)
    setFresh(undefined)
    setCaseId(id)
  }
  return {
    caseId,
    ordering,
    isFresh: (id: string) => id === fresh,
    show,
    /** Shows a case without closing the form; for the first case, before anything is chosen. */
    showFirst: setCaseId,
    openOrderForm: () => setOrdering(true),
    closeOrderForm: () => setOrdering(false),
    showSubmitted: (id: string) => {
      show(id)
      setFresh(id)
    },
  }
}
