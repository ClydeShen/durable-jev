import type { CaseChange, PlanChange, ReferenceData, Role, Shipment } from '@durable-jev/contracts'
import { useState } from 'react'
import { roleLabels } from './roles.js'

const changeLabels: Record<PlanChange['kind'], string> = {
  reassignVehicle: 'vehicle reassigned',
  changeCarrier: 'carrier changed',
  changeQuote: 'quote changed',
}

const plannerRole: Role = 'TRANSPORT_PLANNER'
const commercialRole: Role = 'COMMERCIAL_MANAGER'

export function PlanChangePanel(props: {
  shipment: Shipment
  changes: CaseChange[]
  referenceData: ReferenceData | undefined
  actingRole: Role
  disabled: boolean
  applyChange: (change: PlanChange) => Promise<void>
}) {
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
        </>
      )}
      {props.changes.length > 0 && (
        <>
          <h3>Revision history</h3>
          <ul className="change-history">
            {props.changes.map((change) => (
              <li key={change.changeId}>
                r{change.toRevision} · {changeLabels[change.change.kind]} by{' '}
                {roleLabels[change.requestedBy]} ·{' '}
                <span className="muted">{change.invalidatedRuleIds.length} rules re-checked</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function LegChangeRow(props: {
  leg: Shipment['legs'][number]
  referenceData: ReferenceData | undefined
  warning: boolean
  applyChange: (change: PlanChange) => Promise<void>
}) {
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
        Leg {leg.sequence}: {leg.fromLocation} → {leg.toLocation}
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
