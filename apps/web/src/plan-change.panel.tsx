import type { CaseChange, PlanChange, ReferenceData, Role, Shipment } from '@durable-jev/contracts'
import { useState } from 'react'
import { Dot, Route } from './icons.component.js'
import { hubChoices, routeThroughHub } from './plan/route-change.model.js'
import { roleLabels } from './roles.config.js'

const changeLabels: Record<PlanChange['kind'], string> = {
  reassignVehicle: 'vehicle reassigned',
  changeCarrier: 'carrier changed',
  changeQuote: 'quote changed',
  replaceLegs: 'route replaced',
  recordPackaging: 'new packaging recorded',
}

const plannerRole: Role = 'TRANSPORT_PLANNER'
const commercialRole: Role = 'COMMERCIAL_MANAGER'
const warehouseRole: Role = 'WAREHOUSE_OPERATOR'

export const PlanChangePanel = (props: {
  shipment: Shipment
  changes: CaseChange[]
  referenceData: ReferenceData | undefined
  actingRole: Role
  disabled: boolean
  applyChange: (change: PlanChange) => Promise<void>
}) => {
  const { shipment, referenceData, actingRole } = props
  const [quoteAmount, setQuoteAmount] = useState(String(shipment.quote.amountCents / 100))

  return (
    <section>
      <h2>Plan changes</h2>
      {props.disabled ? (
        <p className="muted small">This order can no longer be changed.</p>
      ) : (
        <>
          {shipment.legs.map((leg) => (
            <LegChangeRow
              key={leg.legId}
              leg={leg}
              referenceData={referenceData}
              warning={actingRole !== plannerRole}
              applyChange={props.applyChange}
            />
          ))}
          <div className="row change-row">
            <label className="small">
              Quote ({shipment.quote.currency})
              <input value={quoteAmount} onChange={(event) => setQuoteAmount(event.target.value)} />
            </label>
            <button
              type="button"
              onClick={() =>
                props.applyChange({
                  kind: 'changeQuote',
                  amountCents: Math.round(Number(quoteAmount) * 100),
                })
              }
            >
              Change quote
            </button>
            {actingRole !== commercialRole && (
              <span className="warning small">requires {roleLabels[commercialRole]}</span>
            )}
          </div>
          <RouteRow
            shipment={shipment}
            referenceData={referenceData}
            warning={actingRole !== plannerRole}
            applyChange={props.applyChange}
          />
          <PackagingRows
            shipment={shipment}
            warning={actingRole !== warehouseRole}
            applyChange={props.applyChange}
          />
        </>
      )}
      {props.changes.length > 0 && (
        <>
          <h3>Revision history</h3>
          <ul className="change-history">
            {props.changes.map((change) => (
              <li key={change.changeId}>
                r{change.toRevision} <Dot /> {changeLabels[change.change.kind]} by{' '}
                {roleLabels[change.requestedBy]} <Dot />{' '}
                <span className="muted">{change.invalidatedRuleIds.length} rules re-checked</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

const LegChangeRow = (props: {
  leg: Shipment['legs'][number]
  referenceData: ReferenceData | undefined
  warning: boolean
  applyChange: (change: PlanChange) => Promise<void>
}) => {
  const { leg, referenceData } = props
  const [carrierId, setCarrierId] = useState<string>(leg.carrierId)
  const [vehicleId, setVehicleId] = useState<string>(leg.vehicleId)
  const vehicles = (referenceData?.vehicles ?? []).filter(
    (vehicle) => vehicle.carrierId === carrierId,
  )
  const carrierChanged = carrierId !== leg.carrierId

  return (
    <div className="row change-row">
      <span className="small">
        Leg {leg.sequence}: <Route from={leg.fromLocation} to={leg.toLocation} />
      </span>
      <select
        aria-label={`Carrier for leg ${leg.sequence}`}
        value={carrierId}
        onChange={(event) => {
          setCarrierId(event.target.value)
          setVehicleId('')
        }}
      >
        {(referenceData?.carriers ?? []).map((carrier) => (
          <option key={carrier.carrierId} value={carrier.carrierId}>
            {carrier.name}
          </option>
        ))}
      </select>
      <select
        aria-label={`Vehicle for leg ${leg.sequence}`}
        value={vehicleId}
        onChange={(event) => setVehicleId(event.target.value)}
      >
        <option value="" disabled>
          choose vehicle
        </option>
        {vehicles.map((vehicle) => (
          <option key={vehicle.vehicleId} value={vehicle.vehicleId}>
            {vehicle.vehicleId}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!vehicleId || (!carrierChanged && vehicleId === leg.vehicleId)}
        onClick={() =>
          props.applyChange(
            carrierChanged
              ? {
                  kind: 'changeCarrier',
                  legId: leg.legId,
                  carrierId: carrierId as never,
                  vehicleId: vehicleId as never,
                }
              : { kind: 'reassignVehicle', legId: leg.legId, vehicleId: vehicleId as never },
          )
        }
      >
        {carrierChanged ? 'Change carrier' : 'Reassign vehicle'}
      </button>
      {props.warning && <span className="warning small">requires {roleLabels[plannerRole]}</span>}
    </div>
  )
}

const RouteRow = (props: {
  shipment: Shipment
  referenceData: ReferenceData | undefined
  warning: boolean
  applyChange: (change: PlanChange) => Promise<void>
}) => {
  const choices = hubChoices(props.shipment, props.referenceData?.hubs ?? [])
  const [hub, setHub] = useState('')
  if (choices.length === 0) return null
  return (
    <div className="row change-row">
      <span className="small">Route</span>
      <select
        aria-label="Transfer hub"
        value={hub}
        onChange={(event) => setHub(event.target.value)}
      >
        <option value="" disabled>
          choose transfer hub
        </option>
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!hub}
        onClick={() => props.applyChange(routeThroughHub(props.shipment, hub))}
      >
        Route through hub
      </button>
      {props.warning && <span className="warning small">requires {roleLabels[plannerRole]}</span>}
    </div>
  )
}

const PackagingRows = (props: {
  shipment: Shipment
  warning: boolean
  applyChange: (change: PlanChange) => Promise<void>
}) => {
  const [packaging, setPackaging] = useState<Record<string, string>>({})
  return (
    <>
      {props.shipment.cargoItems.map((item) => (
        <div className="row change-row" key={item.cargoItemId}>
          <label className="small">
            Packaging of {item.cargoItemId} (now {item.packagingId})
            <input
              value={packaging[item.cargoItemId] ?? ''}
              onChange={(event) =>
                setPackaging({ ...packaging, [item.cargoItemId]: event.target.value })
              }
            />
          </label>
          <button
            type="button"
            disabled={!packaging[item.cargoItemId]}
            onClick={() =>
              props.applyChange({
                kind: 'recordPackaging',
                cargoItemId: item.cargoItemId,
                packagingId: packaging[item.cargoItemId] ?? '',
              })
            }
          >
            Record packaging
          </button>
          {props.warning && (
            <span className="warning small">requires {roleLabels[warehouseRole]}</span>
          )}
        </div>
      ))}
    </>
  )
}
