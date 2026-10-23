import type { OrderForm } from '../api'
import { cargoCategoryLabels } from '../labels'
import { Tag } from './chips'

type Sample = OrderForm['samples'][number]

/** What sets a sample apart at a glance: its kinds of cargo and, when there are several, its legs. */
function SampleTags({ sample }: { sample: Sample }) {
  const { cargoItems, legs } = sample.shipment
  const categories = [...new Set(cargoItems.flatMap((item) => item.declaredCategories))]
  return (
    <span className="chips">
      {categories.map((category) => (
        <Tag key={category}>{cargoCategoryLabels[category]}</Tag>
      ))}
      {legs.length > 1 && <Tag>{legs.length} legs</Tag>}
    </span>
  )
}

/** The sample orders as cards to pick from; picking one fills the form in again. */
export function SamplePicker({
  samples,
  selected,
  onSelect,
}: {
  samples: readonly Sample[]
  selected: string
  onSelect(sample: Sample): void
}) {
  return (
    <div className="sample-cards">
      {samples.map((sample) => (
        <label key={sample.sampleId} className="sample-card">
          <span className="sample-card-head">
            <input
              type="radio"
              name="sample"
              checked={sample.sampleId === selected}
              onChange={() => onSelect(sample)}
            />
            <strong>{sample.sampleId}</strong>
          </span>
          <SampleTags sample={sample} />
          <span className="sample-story">{sample.story}</span>
        </label>
      ))}
    </div>
  )
}
