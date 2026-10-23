import type { CargoItem, Leg, OrderOptions, Shipment } from '@durable-jev/contracts'
import { useEffect, useState } from 'react'
import { api, type OrderForm } from '../api'
import { handoverLabels } from '../labels'
import type { PlaybackSpeed } from '../playback'
import { Tag } from './chips'
import {
  CargoFields,
  Documents,
  fromTimeInput,
  LegFields,
  OrderInput,
  toTimeInput,
} from './OrderFields'

interface Props {
  speed: PlaybackSpeed
  onSubmit(sampleId: string, shipment: Shipment): void
  onCancel(): void
}

type Sample = OrderForm['samples'][number]

/** The order being filled in: the sample it started from, as edited so far. */
interface Draft {
  sample: Sample
  shipment: Shipment
}

const startFrom = (sample: Sample | undefined): Draft | undefined =>
  sample && { sample, shipment: sample.shipment }

function OrderBasics({
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
      <OrderInput label="客户">
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
      <OrderInput label="目的国">
        <input
          required
          pattern="[A-Z]{2}"
          maxLength={2}
          value={shipment.destinationCountry}
          onChange={(event) => onChange({ destinationCountry: event.target.value.toUpperCase() })}
        />
      </OrderInput>
      <OrderInput label="交接方式">
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
      <OrderInput label="报价（€）">
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
      <OrderInput label="最早送达（UTC）">
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
      <OrderInput label="最晚送达（UTC）">
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
        <p className="order-note wide">客户的送货限制：{customer.restrictions}</p>
      )}
    </div>
  )
}

const replaceAt = <T,>(list: readonly T[], index: number, patch: Partial<T>): T[] =>
  list.map((item, at) => (at === index ? { ...item, ...patch } : item))

/**
 * The order entry point, as the customer would submit it. The form starts filled in from a
 * sample order; submitting creates a new case that every agent evaluates from the first rule.
 */
export function NewOrder({ speed, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<OrderForm>()
  const [failure, setFailure] = useState<string>()
  const [draft, setDraft] = useState<Draft>()

  useEffect(() => {
    api.orderForm().then(
      (loaded) => {
        setForm(loaded)
        setDraft(startFrom(loaded.samples[0]))
      },
      (error: unknown) => setFailure(String(error)),
    )
  }, [])

  const sample = draft?.sample
  const shipment = draft?.shipment
  const update = (patch: Partial<Shipment>) =>
    draft && setDraft({ ...draft, shipment: { ...draft.shipment, ...patch } })
  return (
    <section className="new-order">
      <header className="case-header">
        <div className="case-title">
          <h2>新订单</h2>
          <Tag>以客户身份下单</Tag>
        </div>
        <p className="story">
          客户在下单入口提交订单，订单协调 agent 收到后，各 agent
          从第一条规则开始评估。表单已按样例填好，可以直接提交，也可以先改几项再提交。
        </p>
      </header>
      {failure && <p className="message">{failure}</p>}
      {form && sample && shipment && (
        <form
          className="order-form"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit(sample.sampleId, shipment)
          }}
        >
          <fieldset className="order-section">
            <legend>样例</legend>
            <OrderInput label="从这个样例开始" wide>
              <select
                value={sample.sampleId}
                onChange={(event) =>
                  setDraft(
                    startFrom(form.samples.find((item) => item.sampleId === event.target.value)),
                  )
                }
              >
                {form.samples.map((item) => (
                  <option key={item.sampleId} value={item.sampleId}>
                    {item.sampleId}
                  </option>
                ))}
              </select>
            </OrderInput>
            <p className="order-note">{sample.story}</p>
          </fieldset>
          <fieldset className="order-section">
            <legend>客户与交付</legend>
            <OrderBasics shipment={shipment} options={form.options} onChange={update} />
          </fieldset>
          <fieldset className="order-section">
            <legend>货物</legend>
            <CargoFields
              items={shipment.cargoItems}
              onChange={(index, patch: Partial<CargoItem>) =>
                update({ cargoItems: replaceAt(shipment.cargoItems, index, patch) })
              }
            />
          </fieldset>
          <fieldset className="order-section">
            <legend>运输段</legend>
            <LegFields
              legs={shipment.legs}
              options={form.options}
              onChange={(index, patch: Partial<Leg>) =>
                update({ legs: replaceAt(shipment.legs, index, patch) })
              }
            />
          </fieldset>
          <fieldset className="order-section">
            <legend>随附文件（随样例附带）</legend>
            <Documents documents={shipment.documents} />
          </fieldset>
          <footer className="order-submit">
            <button type="submit">提交订单</button>
            <button type="button" className="secondary" onClick={onCancel}>
              取消
            </button>
            {speed === 'realtime' && (
              <span className="muted">
                动画速度是实时，提交后直接显示结果；想看规则逐条亮起，先在左侧选慢、中或快。
              </span>
            )}
          </footer>
        </form>
      )}
    </section>
  )
}
