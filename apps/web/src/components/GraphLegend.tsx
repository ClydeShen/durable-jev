import { useId } from 'react'
import type { Legend } from '../legend-text'

/**
 * A small strip of a graph's colours; hovering or focusing it opens what each colour and mark
 * means, in words the audience understands.
 */
export function GraphLegend({ legend }: { legend: Legend }) {
  const detailsId = useId()
  return (
    <div className="graph-legend">
      <button type="button" className="legend-strip" aria-describedby={detailsId}>
        <span className="legend-title">图例</span>
        {legend.entries.map((entry) => (
          <span key={entry.colour} className="legend-item">
            <span className={`legend-swatch check-status ${entry.colour}`} />
            {entry.name}
          </span>
        ))}
      </button>
      <div id={detailsId} role="tooltip" className="legend-details">
        <dl>
          {legend.entries.map((entry) => (
            <div key={entry.colour}>
              <dt>
                <span className={`legend-swatch check-status ${entry.colour}`} />
                {entry.name}
              </dt>
              <dd>{entry.meaning}</dd>
            </div>
          ))}
          {legend.notes.map((note) => (
            <div key={note.mark}>
              <dt className="legend-mark">{note.mark}</dt>
              <dd>{note.meaning}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
