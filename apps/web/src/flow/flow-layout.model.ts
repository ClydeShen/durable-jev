import { Graph, layout } from '@dagrejs/dagre'
import type { FlowModel } from './flow.model.js'

export const flowNodeSize = { width: 172, height: 74 }

export function layoutFlow(model: FlowModel): Map<string, { x: number; y: number }> {
  const graph = new Graph()
  graph.setGraph({ rankdir: 'LR', nodesep: 16, ranksep: 44, marginx: 8, marginy: 8 })
  graph.setDefaultEdgeLabel(() => ({}))
  for (const node of model.nodes) graph.setNode(node.id, { ...flowNodeSize })
  for (const edge of model.edges) graph.setEdge(edge.from, edge.to)
  layout(graph)
  return new Map(
    model.nodes.map((node) => {
      const { x, y } = graph.node(node.id)
      return [node.id, { x: x - flowNodeSize.width / 2, y: y - flowNodeSize.height / 2 }]
    }),
  )
}
