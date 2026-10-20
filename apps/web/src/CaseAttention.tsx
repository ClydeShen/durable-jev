import type { Attention } from './attention.js'

export function CaseAttention({ attention }: { attention: Attention }) {
  const { waiting, failed } = attention
  return (
    <section className="attention" aria-label="What needs attention">
      <p className="attention-headline">{attention.headline}</p>
      {failed.length > 0 && (
        <div className="attention-group">
          <h3>Failed</h3>
          <ul>
            {failed.map((item) => (
              <li key={item.key}>
                <span aria-hidden="true">✕</span> {item.label}{' '}
                <span className="muted small">{item.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {waiting.length > 0 && (
        <div className="attention-group">
          <h3>Waiting for</h3>
          <ul>
            {waiting.map((item) => (
              <li key={item.key}>
                <span aria-hidden="true">◔</span> {item.label}{' '}
                <span className="muted small">· {item.detail}</span>
                {item.yours && <span className="you-tag">you</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
