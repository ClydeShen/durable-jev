import type { CargoItem, Leg, Shipment } from '@durable-jev/contracts'
import { type ReactNode, useEffect, useState } from 'react'
import { api, type OrderForm } from '../api'
import type { PlaybackSpeed } from '../playback'
import { Tag } from './chips'
import { CargoFields, Documents, LegFields, OrderBasics } from './OrderFields'
import { SamplePicker } from './OrderSamples'
import { OrderSummary } from './OrderSummary'

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

const replaceAt = <T,>(list: readonly T[], index: number, patch: Partial<T>): T[] =>
  list.map((item, at) => (at === index ? { ...item, ...patch } : item))

/** One numbered step of the form. */
function Step({
  number,
  title,
  hint,
  children,
}: {
  number: number
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <fieldset className="order-section">
      <legend>
        <span className="order-step" aria-hidden="true">
          {number}
        </span>
        {title}
      </legend>
      {hint && <p className="order-hint">{hint}</p>}
      {children}
    </fieldset>
  )
}

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
      {form && draft && (
        <form
          className="order-layout"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit(draft.sample.sampleId, draft.shipment)
          }}
        >
          <div className="order-steps">
            <Step number={1} title="选一个样例" hint="选中后下面的表单按这个样例重新填好">
              <SamplePicker
                samples={form.samples}
                selected={draft.sample.sampleId}
                onSelect={(sample) => setDraft(startFrom(sample))}
              />
            </Step>
            <Step number={2} title="客户与交付">
              <OrderBasics shipment={draft.shipment} options={form.options} onChange={update} />
            </Step>
            <Step number={3} title="货物">
              <CargoFields
                items={draft.shipment.cargoItems}
                onChange={(index, patch: Partial<CargoItem>) =>
                  update({ cargoItems: replaceAt(draft.shipment.cargoItems, index, patch) })
                }
              />
            </Step>
            <Step number={4} title="运输段">
              <LegFields
                legs={draft.shipment.legs}
                options={form.options}
                onChange={(index, patch: Partial<Leg>) =>
                  update({ legs: replaceAt(draft.shipment.legs, index, patch) })
                }
              />
            </Step>
            <Step number={5} title="随附文件" hint="来自样例，随订单一起提交，这里不能改">
              <Documents documents={draft.shipment.documents} />
            </Step>
          </div>
          <OrderSummary
            sampleId={draft.sample.sampleId}
            sample={draft.sample.shipment}
            shipment={draft.shipment}
            options={form.options}
            speed={speed}
            onRestore={() => setDraft(startFrom(draft.sample))}
            onCancel={onCancel}
          />
        </form>
      )}
    </section>
  )
}
