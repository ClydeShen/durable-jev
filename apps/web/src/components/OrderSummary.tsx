import type { OrderOptions, Shipment } from '@durable-jev/contracts'
import { countOf, moneyOf } from '../labels'
import { Chip, Tags } from './chips'
import { Field, Fields } from './ui'

/** The parts of an order the form edits, each as a person names it. */
const formSections: [string, (shipment: Shipment) => unknown][] = [
  [
    'Customer and delivery',
    (shipment) => [
      shipment.customerId,
      shipment.destinationCountry,
      shipment.handover,
      shipment.quote,
      shipment.deliveryWindow,
    ],
  ],
  ['Cargo', (shipment) => shipment.cargoItems],
  ['Legs', (shipment) => shipment.legs],
]

const changedSections = (sample: Shipment, edited: Shipment) =>
  formSections
    .filter(([, part]) => JSON.stringify(part(sample)) !== JSON.stringify(part(edited)))
    .map(([name]) => name)

const utcTime = (timestamp: string) =>
  new Date(timestamp).toLocaleString('en-GB', {
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
    <aside className="order-summary" aria-label="Order summary">
      <h3>Order summary</h3>
      <Fields>
        <Field label="Sample">
          <Chip>{sampleId}</Chip>
        </Field>
        <Field label="Customer">{customer?.name ?? shipment.customerId}</Field>
        <Field label="Destination">{shipment.destinationCountry}</Field>
        <Field label="Cargo">
          {countOf(shipment.cargoItems.length, 'item')}, {weight} kg in all
        </Field>
        <Field label="Deliver from">{utcTime(shipment.deliveryWindow.from)} UTC</Field>
        <Field label="Deliver by">{utcTime(shipment.deliveryWindow.to)} UTC</Field>
        <Field label="Quote">{moneyOf(shipment.quote.amountCents)}</Field>
        <Field label="Route">
          <Route legs={shipment.legs} />
        </Field>
        <Field label="Changed">
          {changed.length === 0 ? (
            <span className="muted">Same as the sample</span>
          ) : (
            <span className="order-changes">
              <Tags items={changed} />
              <button type="button" className="link-action" onClick={onRestore}>
                Restore the sample
              </button>
            </span>
          )}
        </Field>
      </Fields>
      <ol className="order-next">
        <li>Order coordination receives the order</li>
        <li>Every agent decides its rules one by one from the first</li>
        <li>Where a person is needed, a task waits for that role</li>
      </ol>
      <button type="submit" className="order-send">
        Submit order
      </button>
      <button type="button" className="secondary" onClick={onCancel}>
        Cancel
      </button>
    </aside>
  )
}
