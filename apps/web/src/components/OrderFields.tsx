import type { CargoCategory, CargoItem, Leg, OrderOptions, Shipment } from '@durable-jev/contracts'
import type { ReactNode } from 'react'
import { cargoCategoryLabels, documentKindLabels, handoverLabels } from '../labels'
import { Chip } from './chips'

/** Timestamps are UTC; the form edits them as UTC wall-clock time. */
const toTimeInput = (timestamp: string) => timestamp.slice(0, 16)
const fromTimeInput = (value: string) => `${value}:00Z`

/** One labelled input of the order form. */
function OrderInput({
  label,
  wide,
  children,
}: {
  label: string
  /** Takes the whole row, for long text. */
  wide?: boolean
  children: ReactNode
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the child passed in
    <label className={wide ? 'order-input wide' : 'order-input'}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

const categories = Object.keys(cargoCategoryLabels) as CargoCategory[]

function Categories({
  selected,
  onChange,
}: {
  selected: readonly CargoCategory[]
  onChange(categories: CargoCategory[]): void
}) {
  return (
    <fieldset className="order-input order-choices">
      <legend className="field-label">Category</legend>
      {categories.map((category) => {
        const checked = selected.includes(category)
        return (
          <label key={category} className="order-toggle">
            <input
              type="checkbox"
              checked={checked}
              // An item declares at least one category.
              disabled={checked && selected.length === 1}
              onChange={() =>
                onChange(
                  checked
                    ? selected.filter((other) => other !== category)
                    : [...selected, category],
                )
              }
            />
            <span aria-hidden="true">{checked ? '✓' : '+'}</span>
            {cargoCategoryLabels[category]}
          </label>
        )
      })}
    </fieldset>
  )
}

function CargoCard({
  item,
  onChange,
}: {
  item: CargoItem
  onChange(patch: Partial<CargoItem>): void
}) {
  const range = item.temperatureRange
  return (
    <li className="order-card">
      <Chip>{item.cargoItemId}</Chip>
      <div className="order-grid">
        <OrderInput label="Description" wide>
          <textarea
            rows={2}
            value={item.description}
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </OrderInput>
        <Categories
          selected={item.declaredCategories}
          onChange={(declaredCategories) => onChange({ declaredCategories })}
        />
        <OrderInput label="Quantity">
          <input
            type="number"
            min={1}
            required
            value={item.quantity}
            onChange={(event) => onChange({ quantity: Number(event.target.value) })}
          />
        </OrderInput>
        <OrderInput label="Total weight (kg)">
          <input
            type="number"
            min={0.001}
            step={0.001}
            required
            value={item.weightGrams / 1000}
            onChange={(event) =>
              onChange({ weightGrams: Math.round(Number(event.target.value) * 1000) })
            }
          />
        </OrderInput>
        {range && (
          <OrderInput label="Temperature range (°C)">
            <span className="order-range">
              <input
                type="number"
                step={0.1}
                aria-label="Lowest temperature"
                value={range.minDeciCelsius / 10}
                onChange={(event) =>
                  onChange({
                    temperatureRange: {
                      ...range,
                      minDeciCelsius: Math.round(Number(event.target.value) * 10),
                    },
                  })
                }
              />
              to
              <input
                type="number"
                step={0.1}
                aria-label="Highest temperature"
                value={range.maxDeciCelsius / 10}
                onChange={(event) =>
                  onChange({
                    temperatureRange: {
                      ...range,
                      maxDeciCelsius: Math.round(Number(event.target.value) * 10),
                    },
                  })
                }
              />
            </span>
          </OrderInput>
        )}
      </div>
    </li>
  )
}

export function CargoFields({
  items,
  onChange,
}: {
  items: readonly CargoItem[]
  onChange(index: number, patch: Partial<CargoItem>): void
}) {
  return (
    <ul className="order-cards">
      {items.map((item, index) => (
        <CargoCard
          key={item.cargoItemId}
          item={item}
          onChange={(patch) => onChange(index, patch)}
        />
      ))}
    </ul>
  )
}

function LegCard({
  leg,
  options,
  onChange,
}: {
  leg: Leg
  options: OrderOptions
  onChange(patch: Partial<Leg>): void
}) {
  const vehicles = options.vehicles.filter((vehicle) => vehicle.carrierId === leg.carrierId)
  const place = (field: 'origin' | 'destination') => (
    <select value={leg[field]} onChange={(event) => onChange({ [field]: event.target.value })}>
      {[...new Set([leg[field], ...options.locations])].map((location) => (
        <option key={location}>{location}</option>
      ))}
    </select>
  )
  return (
    <li className="order-card">
      <span className="order-card-head">
        <Chip>{leg.legId}</Chip>
        <span className="order-leg-route">
          {leg.origin}
          <span aria-hidden="true">→</span>
          {leg.destination}
        </span>
      </span>
      <div className="order-grid">
        <OrderInput label="From">{place('origin')}</OrderInput>
        <OrderInput label="To">{place('destination')}</OrderInput>
        <OrderInput label="Carrier">
          <select
            value={leg.carrierId}
            onChange={(event) => {
              const carrierId = event.target.value
              const first = options.vehicles.find((vehicle) => vehicle.carrierId === carrierId)
              onChange({ carrierId, vehicleId: first?.vehicleId ?? leg.vehicleId })
            }}
          >
            {options.carriers.map((carrier) => (
              <option key={carrier.carrierId} value={carrier.carrierId}>
                {carrier.name}
              </option>
            ))}
          </select>
        </OrderInput>
        <OrderInput label="Vehicle">
          <select
            value={leg.vehicleId}
            onChange={(event) => onChange({ vehicleId: event.target.value })}
          >
            {vehicles.map((vehicle) => (
              <option key={vehicle.vehicleId} value={vehicle.vehicleId}>
                {vehicle.vehicleId}
                {vehicle.temperatureControlled ? ' (temperature controlled)' : ''}
              </option>
            ))}
          </select>
        </OrderInput>
        <OrderInput label="Planned departure (UTC)">
          <input
            type="datetime-local"
            required
            value={toTimeInput(leg.plannedDeparture)}
            onChange={(event) => onChange({ plannedDeparture: fromTimeInput(event.target.value) })}
          />
        </OrderInput>
        <OrderInput label="Planned arrival (UTC)">
          <input
            type="datetime-local"
            required
            value={toTimeInput(leg.plannedArrival)}
            onChange={(event) => onChange({ plannedArrival: fromTimeInput(event.target.value) })}
          />
        </OrderInput>
      </div>
    </li>
  )
}

export function LegFields({
  legs,
  options,
  onChange,
}: {
  legs: readonly Leg[]
  options: OrderOptions
  onChange(index: number, patch: Partial<Leg>): void
}) {
  return (
    <ul className="order-cards">
      {legs.map((leg, index) => (
        <LegCard
          key={leg.legId}
          leg={leg}
          options={options}
          onChange={(patch) => onChange(index, patch)}
        />
      ))}
    </ul>
  )
}

/** The documents the sample order carries; they go with the order unchanged. */
export function Documents({ documents }: { documents: Shipment['documents'] }) {
  if (documents.length === 0) return <p className="muted">This sample has no documents.</p>
  return (
    <ul className="order-documents">
      {documents.map((document) => (
        <li key={document.documentId}>
          <strong>{documentKindLabels[document.kind] ?? document.kind}</strong>
          {document.cargoItemId && <Chip>{document.cargoItemId}</Chip>}
          <span className="muted">{document.text}</span>
        </li>
      ))}
    </ul>
  )
}

/** Who orders, where it goes, how it is handed over, when, and at what price. */
export function OrderBasics({
  shipment,
  options,
  onChange,
}: {
  shipment: Shipment
  options: OrderOptions
  onChange(patch: Partial<Shipment>): void
}) {
  const customer = options.customers.find((item) => item.customerId === shipment.customerId)
  const deliveryWindow = shipment.deliveryWindow
  return (
    <div className="order-grid">
      <OrderInput label="Customer">
        <select
          value={shipment.customerId}
          onChange={(event) => onChange({ customerId: event.target.value })}
        >
          {options.customers.map((item) => (
            <option key={item.customerId} value={item.customerId}>
              {item.name}
            </option>
          ))}
        </select>
      </OrderInput>
      <OrderInput label="Destination country">
        <input
          required
          pattern="[A-Z]{2}"
          maxLength={2}
          value={shipment.destinationCountry}
          onChange={(event) => onChange({ destinationCountry: event.target.value.toUpperCase() })}
        />
      </OrderInput>
      <OrderInput label="Handover">
        <select
          value={shipment.handover}
          onChange={(event) => onChange({ handover: event.target.value as Shipment['handover'] })}
        >
          {Object.entries(handoverLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </OrderInput>
      <OrderInput label="Quote (NZ$)">
        <input
          type="number"
          min={0}
          step={0.01}
          required
          value={shipment.quote.amountCents / 100}
          onChange={(event) =>
            onChange({
              quote: {
                ...shipment.quote,
                amountCents: Math.round(Number(event.target.value) * 100),
              },
            })
          }
        />
      </OrderInput>
      <OrderInput label="Deliver from (UTC)">
        <input
          type="datetime-local"
          required
          value={toTimeInput(deliveryWindow.from)}
          onChange={(event) =>
            onChange({
              deliveryWindow: { ...deliveryWindow, from: fromTimeInput(event.target.value) },
            })
          }
        />
      </OrderInput>
      <OrderInput label="Deliver by (UTC)">
        <input
          type="datetime-local"
          required
          value={toTimeInput(deliveryWindow.to)}
          onChange={(event) =>
            onChange({
              deliveryWindow: { ...deliveryWindow, to: fromTimeInput(event.target.value) },
            })
          }
        />
      </OrderInput>
      {customer?.restrictions && (
        <p className="order-note wide">Customer's delivery restrictions: {customer.restrictions}</p>
      )}
    </div>
  )
}
