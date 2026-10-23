import { useId, useRef, useState } from 'react'
import type { Legend } from '../legend-text'
import { useDismiss } from '../use-dismiss'

/**
 * A small strip of a graph's colours; clicking it opens a panel that says what each colour and
 * mark means, in words the audience understands.
 */
export function GraphLegend({ legend }: { legend: Legend }) {
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useDismiss(open, root, () => setOpen(false))
  return (
    <div className="graph-legend" ref={root}>
      <button
        type="button"
        className="legend-strip"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <span className="legend-title">Legend</span>
        {legend.entries.map((entry) => (
          <span key={entry.colour} className="legend-item">
            <span className={`legend-swatch check-status ${entry.colour}`} />
            {entry.name}
          </span>
        ))}
      </button>
      {open && (
        <section id={panelId} className="legend-panel" aria-label="What the colours and marks mean">
          <h4>Colours</h4>
          <dl>
            {[...legend.entries, ...legend.highlights].map((entry) => (
              <div key={entry.colour}>
                <dt>
                  <span className={`legend-swatch check-status ${entry.colour}`} />
                  {entry.name}
                </dt>
                <dd>{entry.meaning}</dd>
              </div>
            ))}
          </dl>
          <h4>Marks</h4>
          <dl>
            {legend.notes.map((note) => (
              <div key={note.mark}>
                <dt className="legend-mark">{note.mark}</dt>
                <dd>{note.meaning}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  )
}
