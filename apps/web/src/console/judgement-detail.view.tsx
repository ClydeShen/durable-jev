import type { StoredEvent } from '@durable-jev/contracts'
import { Icon } from '../icons.component.js'
import { StatusBadge } from '../status-badge.component.js'
import { businessEvents, describeAnswer, formatDuration, judgements } from './console.model.js'

export function JudgementDetail(props: {
  events: StoredEvent[]
  highlightRule: string | undefined
}) {
  const rows = judgements(businessEvents(props.events))
  return (
    <section>
      <h2>Judgements</h2>
      <p className="muted small">
        On the left, what the model returned. On the right, what the rule made of it. A probability
        is the model's own confidence in its answer; it has not been checked against known results.
      </p>
      {rows.length === 0 ? (
        <p className="muted">No model judgements were recorded for this order.</p>
      ) : (
        <div className="judgements">
          {rows.map((row) => {
            const asked = row.requested?.attributes ?? {}
            const answered = row.completed?.attributes ?? {}
            const highlighted = props.highlightRule === row.ruleId
            return (
              <article
                key={`${row.ruleId}@${row.entityId}`}
                className={`judgement${highlighted ? ' timeline-highlight' : ''}`}
              >
                <header>
                  <strong>{row.ruleId}</strong> <span className="muted small">{row.entityId}</span>
                </header>
                <div className="judgement-columns">
                  <div>
                    <h3>
                      <Icon name="jev" /> The model returned
                    </h3>
                    <dl>
                      <dt>Provider</dt>
                      <dd>
                        {String(answered.provider ?? asked.provider ?? 'unknown')},{' '}
                        {String(answered.modelId ?? asked.modelId ?? 'unknown')}
                        {(answered.provider ?? asked.provider) === 'scripted' && (
                          <span className="muted small">
                            {' '}
                            (a scripted answer, not a model call)
                          </span>
                        )}
                      </dd>
                      <dt>Answer</dt>
                      <dd>
                        {row.completed ? describeAnswer(answered.answer) : 'no answer recorded'}
                        {typeof (answered.answer as { probabilities?: unknown })?.probabilities ===
                          'object' && (
                          <pre className="raw">
                            {JSON.stringify(
                              (answered.answer as { probabilities: unknown }).probabilities,
                              null,
                              1,
                            )}
                          </pre>
                        )}
                      </dd>
                      <dt>Took</dt>
                      <dd>
                        {row.completed?.durationMs === undefined
                          ? 'unknown'
                          : formatDuration(row.completed.durationMs)}
                      </dd>
                      <dt>Question</dt>
                      <dd className="muted small">
                        {String(asked.kind ?? 'unknown')}, input hash{' '}
                        {String(asked.inputHash ?? 'unknown')}
                      </dd>
                    </dl>
                  </div>
                  <div>
                    <h3>
                      <Icon name="code" /> The rule decided
                    </h3>
                    {row.decided?.status ? (
                      <StatusBadge status={row.decided.status as never} />
                    ) : (
                      <span className="muted">no result recorded</span>
                    )}
                    <p className="muted small">
                      Whether an answer is enough to pass is set by the policy thresholds, not by
                      the model.
                    </p>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
