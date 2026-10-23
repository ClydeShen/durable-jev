import type { OrderOptions, Shipment } from '@durable-jev/contracts'
import { Chip, Tags } from './chips'
import { Field, Fields } from './ui'

/** The parts of an order the form edits, each as a person names it. */
const formSections: [string, (shipment: Shipment) => unknown][] = [
  [
    '客户与交付',
    (shipment) => [
      shipment.customerId,
      shipment.destinationCountry,
      shipment.handover,
      shipment.quote,
      shipment.deliveryWindow,
    ],
  ],
  ['货物', (shipment) => shipment.cargoItems],
  ['运输段', (shipment) => shipment.legs],
]

const changedSections = (sample: Shipment, edited: Shipment) =>
  formSections
    .filter(([, part]) => JSON.stringify(part(sample)) !== JSON.stringify(part(edited)))
    .map(([name]) => name)

const utcTime = (timestamp: string) =>
  new Date(timestamp).toLocaleString('zh-CN', {
    timeZone: 'UTC',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

/** The places the order passes, first origin to last destination. */
function Route({ legs }: { legs: Shipment['legs'] }) {
  return (
    <ol className="order-route">
      <li>{legs[0]?.origin}</li>
      {legs.map((leg) => (
        <li key={leg.legId}>{leg.destination}</li>
      ))}
    </ol>
  )
}

interface Props {
  sampleId: string
  sample: Shipment
  shipment: Shipment
  options: OrderOptions
  onRestore(): void
  onCancel(): void
}

/**
 * The order as it will be submitted, beside the form and always in view, with the submit button:
 * what the customer orders, what was changed from the sample, and what happens next.
 */
export function OrderSummary({ sampleId, sample, shipment, options, onRestore, onCancel }: Props) {
  const customer = options.customers.find((item) => item.customerId === shipment.customerId)
  const weight = shipment.cargoItems.reduce((total, item) => total + item.weightGrams, 0) / 1000
  const changed = changedSections(sample, shipment)
  return (
    <aside className="order-summary" aria-label="订单摘要">
      <h3>订单摘要</h3>
      <Fields>
        <Field label="样例">
          <Chip>{sampleId}</Chip>
        </Field>
        <Field label="客户">{customer?.name ?? shipment.customerId}</Field>
        <Field label="目的国">{shipment.destinationCountry}</Field>
        <Field label="货物">
          {shipment.cargoItems.length} 件，共 {weight} kg
        </Field>
        <Field label="最早送达">{utcTime(shipment.deliveryWindow.from)} UTC</Field>
        <Field label="最晚送达">{utcTime(shipment.deliveryWindow.to)} UTC</Field>
        <Field label="报价">€{shipment.quote.amountCents / 100}</Field>
        <Field label="路线">
          <Route legs={shipment.legs} />
        </Field>
        <Field label="改动">
          {changed.length === 0 ? (
            <span className="muted">与样例相同</span>
          ) : (
            <span className="order-changes">
              <Tags items={changed} />
              <button type="button" className="link-action" onClick={onRestore}>
                恢复样例
              </button>
            </span>
          )}
        </Field>
      </Fields>
      <ol className="order-next">
        <li>订单协调 agent 收到订单</li>
        <li>各 agent 从第一条规则开始逐条判断</li>
        <li>需要人处理的地方开出任务，等对应角色</li>
      </ol>
      <button type="submit" className="order-send">
        提交订单
      </button>
      <button type="button" className="secondary" onClick={onCancel}>
        取消
      </button>
    </aside>
  )
}
