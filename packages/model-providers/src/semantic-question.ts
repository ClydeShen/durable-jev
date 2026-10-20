import type { CaseEvidence, Shipment } from '@durable-jev/contracts'
import { z } from 'zod'

export const SemanticQuestionTemplate = z.object({
  ruleId: z.string().min(1),
  scope: z.enum(['order', 'cargoItem']),
  kind: z.enum(['noul', 'choice']),
  prompt: z.string().min(1),
  options: z.record(z.string(), z.string()).optional(),
  state: z.array(z.string().min(1)).min(1),
})
export type SemanticQuestionTemplate = z.infer<typeof SemanticQuestionTemplate>

export const SemanticQuestionCatalog = z.object({
  version: z.string(),
  questions: z.array(SemanticQuestionTemplate),
})
export type SemanticQuestionCatalog = z.infer<typeof SemanticQuestionCatalog>

export type SemanticQuestion = {
  ruleId: string
  entityId: string
  kind: 'noul' | 'choice'
  prompt: string
  options?: Record<string, string>
  state: Record<string, string>
}

type SourceContext = { shipment: Shipment; evidence: CaseEvidence; cargoItemId?: string }

function resolveSource(source: string, context: SourceContext): string | undefined {
  const { shipment, evidence, cargoItemId } = context
  const item = shipment.cargoItems.find((candidate) => candidate.cargoItemId === cargoItemId)
  if (source === 'item.description') return item?.description
  if (source === 'item.declaredCategories') return item?.declaredCategories.join(', ')
  if (source === 'item.inspectionNote') {
    return evidence.inspectionNotes.findLast((note) => note.cargoItemId === cargoItemId)?.note
  }
  if (source.startsWith('item.document:')) {
    const kind = source.slice('item.document:'.length)
    return evidence.documents.findLast(
      (document) => document.cargoItemId === cargoItemId && document.kind === kind,
    )?.text
  }
  if (source === 'order.customerInstructions') return shipment.customerInstructions
  if (source === 'order.routeSummary') {
    return [...shipment.legs]
      .sort((left, right) => left.sequence - right.sequence)
      .map((leg) => `${leg.fromLocation} to ${leg.toLocation} by ${leg.carrierId}`)
      .join('; ')
  }
  throw new Error(`unknown semantic state source ${source}`)
}

const stateKeyOf = (source: string) => source.replace(/^(item|order)\./, '').replace(':', '_')

export function buildSemanticQuestions(input: {
  templates: readonly SemanticQuestionTemplate[]
  ruleIds: ReadonlySet<string>
  shipment: Shipment
  evidence: CaseEvidence
}): SemanticQuestion[] {
  return input.templates
    .filter((template) => input.ruleIds.has(template.ruleId))
    .flatMap((template) => {
      const entityIds =
        template.scope === 'order'
          ? ['order']
          : input.shipment.cargoItems.map((item) => item.cargoItemId as string)
      return entityIds.flatMap((entityId): SemanticQuestion[] => {
        const context = {
          shipment: input.shipment,
          evidence: input.evidence,
          ...(template.scope === 'cargoItem' ? { cargoItemId: entityId } : {}),
        }
        const state: Record<string, string> = {}
        for (const source of template.state) {
          const value = resolveSource(source, context)?.trim()
          if (!value) return []
          state[stateKeyOf(source)] = value
        }
        return [
          {
            ruleId: template.ruleId,
            entityId,
            kind: template.kind,
            prompt: template.prompt,
            ...(template.options ? { options: template.options } : {}),
            state,
          },
        ]
      })
    })
}
