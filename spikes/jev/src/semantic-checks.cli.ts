import { choice, noul, TypeSafeClient } from '@typesafe-ai/sdk'

const pinnedModel = 'jev-1.14.0'
const isLive = process.env.MODEL_MODE === 'live' && Boolean(process.env.TYPESAFE_API_KEY)

const recordedResponse = {
  model: pinnedModel,
  answers: {
    packagingRisk: {
      type: 'choice',
      choice: 'damaged_packaging',
      confidence: 0.77,
      probabilities: { no_risk: 0, damaged_packaging: 0.85, cold_chain_risk: 0.15 },
    },
    documentMatchesDeclaration: { type: 'noul', noul: 0.05 },
  },
  usage: { input_tokens: 440, output_tokens: 77 },
}

async function recordedFetch(url: string, init?: RequestInit): Promise<Response> {
  console.log(`[recorded] POST ${url}`)
  console.log(`[recorded] body: ${init?.body}`)
  return new Response(JSON.stringify(recordedResponse), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

const client = new TypeSafeClient({
  defaultModel: pinnedModel,
  apiKey: isLive ? undefined : 'recorded-mode',
  compression: false,
  ...(isLive ? {} : { fetch: recordedFetch }),
})

const inspectionState = {
  inspectionNote:
    'Outer carton crushed on one corner, ice packs partly melted, condensation inside.',
  declaredCargo: 'Vaccines, 2-8C, 40 vials',
  safetyDataSheetSummary: 'Lithium batteries, UN3480',
}

const startedAt = performance.now()
const result = await client.systemOne({
  state: inspectionState,
  questions: {
    packagingRisk: choice('Which risk signal does the inspection note show?', {
      no_risk: 'No packaging damage or temperature risk is described',
      damaged_packaging: 'Physical damage to packaging is described',
      cold_chain_risk: 'Temperature control appears compromised without physical damage',
    }),
    documentMatchesDeclaration: noul(
      'The safety data sheet describes the same goods as the declared cargo',
    ),
  },
})
const durationMs = Math.round(performance.now() - startedAt)

console.log(`mode: ${isLive ? 'live' : 'recorded'}`)
console.log(`model: ${result.model}`)
console.log(`packagingRisk: ${JSON.stringify(result.answers.packagingRisk)}`)
console.log(
  `documentMatchesDeclaration: ${JSON.stringify(result.answers.documentMatchesDeclaration)}`,
)
console.log(`usage: ${JSON.stringify(result.usage)}, durationMs: ${durationMs}`)
