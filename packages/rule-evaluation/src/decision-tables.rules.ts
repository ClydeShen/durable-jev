import { z } from 'zod'

export const MixingMatrix = z.object({
  tableId: z.literal('mixing-matrix'),
  version: z.string(),
  forbiddenPairs: z.array(
    z.object({ tokens: z.tuple([z.string(), z.string()]), reason: z.string() }),
  ),
})
export type MixingMatrix = z.infer<typeof MixingMatrix>

export type DecisionTables = { mixingMatrix: MixingMatrix }

export const forbiddenMixes = (matrix: MixingMatrix, tokens: ReadonlySet<string>) => {
  return matrix.forbiddenPairs.filter(
    ({ tokens: [first, second] }) => tokens.has(first) && tokens.has(second),
  )
}
