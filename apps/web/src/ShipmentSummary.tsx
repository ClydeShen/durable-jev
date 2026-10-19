import type { Shipment } from '@durable-jev/contracts'

const kilograms = (grams: number) => `${(grams / 1000).toLocaleString()} kg`
const money = (cents: number, currency: string) =>
  `${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${currency}`

export function ShipmentSummary({ shipment }: { shipment: Shipment }) {
  return (
    <section className="shipment">
      <dl>
        <dt>客户</dt>
        <dd>{shipment.customerId}</dd>
        <dt>报价</dt>
        <dd>{money(shipment.quote.amountCents, shipment.quote.currency)}</dd>
        <dt>版本</dt>
        <dd>r{shipment.caseRevision}</dd>
      </dl>
      <h3>货件</h3>
      <ul>
        {shipment.cargoItems.map((item) => (
          <li key={item.cargoItemId}>
            {item.cargoItemId} · {item.declaredCategories.join('/')} · {kilograms(item.weightGrams)}
            <div className="muted small">{item.description}</div>
          </li>
        ))}
      </ul>
      <h3>运输段</h3>
      <ul>
        {shipment.legs.map((leg) => (
          <li key={leg.legId}>
            {leg.sequence}. {leg.fromLocation} → {leg.toLocation} · {leg.carrierId} ·{' '}
            {leg.vehicleId}
          </li>
        ))}
      </ul>
    </section>
  )
}
