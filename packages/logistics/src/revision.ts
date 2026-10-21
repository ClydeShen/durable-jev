import { type Shipment, shipmentSchema } from '@durable-jev/contracts'

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

function mergePatch(target: Json, patch: Json): Json {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch
  const base = target !== null && typeof target === 'object' && !Array.isArray(target) ? target : {}
  const merged: { [key: string]: Json } = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key]
    else merged[key] = mergePatch(merged[key] ?? null, value)
  }
  return merged
}

export function applyRevision(shipment: Shipment, patch: Record<string, unknown>): Shipment {
  return shipmentSchema.parse(mergePatch(shipment as unknown as Json, patch as Json))
}
