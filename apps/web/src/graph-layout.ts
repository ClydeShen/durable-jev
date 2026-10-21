export const nodeSize = { width: 200, height: 64 }

export interface GraphNode {
  id: string
  dependsOn: readonly string[]
}

export type Positions = Record<string, { x: number; y: number }>

const loadElk = async () => new (await import('elkjs/lib/elk.bundled.js')).default()

export async function layoutGraph(nodes: readonly GraphNode[]): Promise<Positions> {
  const known = new Set(nodes.map((node) => node.id))
  const elk = await loadElk()
  const graph = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '20',
      'elk.layered.spacing.nodeNodeBetweenLayers': '56',
    },
    children: nodes.map((node) => ({ id: node.id, ...nodeSize })),
    edges: nodes.flatMap((node) =>
      node.dependsOn
        .filter((dependency) => known.has(dependency))
        .map((dependency) => ({
          id: `${dependency}->${node.id}`,
          sources: [dependency],
          targets: [node.id],
        })),
    ),
  })
  return Object.fromEntries(
    (graph.children ?? []).map((child) => [child.id, { x: child.x ?? 0, y: child.y ?? 0 }]),
  )
}
