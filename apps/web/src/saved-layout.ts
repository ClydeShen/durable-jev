import type { NodeChange } from '@xyflow/react'
import { useCallback, useEffect, useState } from 'react'
import { readStored, writeStored } from './browser-storage'
import type { Positions } from './graph-layout'

const layoutKey = (graph: string) => `layout:${graph}`

/**
 * Where the presenter dragged nodes of one graph, kept in this browser. The automatic layout
 * places every other node.
 */
export function useSavedLayout(graph: string) {
  const [moved, setMoved] = useState<Positions>(() => readStored(layoutKey(graph), {}))
  useEffect(() => setMoved(readStored(layoutKey(graph), {})), [graph])
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setMoved((current) => {
        let next = current
        for (const change of changes) {
          if (change.type === 'position' && change.position) {
            next = { ...next, [change.id]: change.position }
          }
        }
        if (next !== current) writeStored(layoutKey(graph), next)
        return next
      })
    },
    [graph],
  )
  const reset = useCallback(() => {
    writeStored(layoutKey(graph), undefined)
    setMoved({})
  }, [graph])
  return { moved, onNodesChange, reset }
}
