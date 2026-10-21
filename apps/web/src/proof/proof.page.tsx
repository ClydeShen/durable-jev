import { useCallback, useEffect, useState } from 'react'
import { api, type ProofKind, type ProofRun } from '../api.js'
import { Icon } from '../icons.js'

const sections: { kind: ProofKind; title: string; says: string }[] = [
  {
    kind: 'replay',
    title: 'Replay of the eight demo orders',
    says: 'Each order is replayed step by step against what its reviewer expects: statuses, rule results, who may act, what is refused. It uses scripted model answers and never calls Jev.',
  },
  {
    kind: 'faults',
    title: 'Fault scenarios',
    says: 'Crashes, duplicates, slow or unavailable services, stale answers, forbidden actions. Where the fault is a crash, a real process is killed. It takes a minute or two.',
  },
]

const pollMs = 2000

export const ProofPage = () => {
  const [runs, setRuns] = useState<Record<ProofKind, ProofRun>>()
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    try {
      setRuns(await api.proof())
      setError(undefined)
    } catch {
      setError('Cannot reach the control server. Is the stack running?')
    }
  }, [])

  const anyRunning =
    runs !== undefined && Object.values(runs).some((run) => run.state === 'running')
  useEffect(() => {
    load()
    if (!anyRunning) return
    const timer = setInterval(load, pollMs)
    return () => clearInterval(timer)
  }, [load, anyRunning])

  const start = async (kind: ProofKind) => {
    try {
      await api.runProof(kind)
    } catch {
      setError('Could not start the run.')
    }
    await load()
  }

  return (
    <main className="content proof">
      <h2>Proof</h2>
      <p className="muted">
        These runs check the system against its expected behaviour. They run on their own copy of
        the services, so they do not touch the orders on the workbench.
      </p>
      {error && <p className="warning">{error}</p>}
      {sections.map((section) => {
        const run = runs?.[section.kind]
        return (
          <section key={section.kind} className="proof-section">
            <header>
              <h3>{section.title}</h3>
              <button
                type="button"
                className="primary"
                disabled={run?.state === 'running'}
                onClick={() => start(section.kind)}
              >
                <Icon name={run?.state === 'running' ? 'evaluating' : 'start'} />{' '}
                {run?.state === 'running' ? 'Running' : run?.state === 'done' ? 'Run again' : 'Run'}
              </button>
            </header>
            <p className="muted small">{section.says}</p>
            {run?.state === 'done' && (
              <p className={run.passed ? 'proof-pass' : 'proof-fail'} role="status">
                <Icon name={run.passed ? 'pass' : 'failed'} /> {run.summary ?? 'No result'}
              </p>
            )}
            {run?.state === 'idle' && <p className="muted small">Not run yet.</p>}
            <ul className="proof-items">
              {run?.items.map((item) => (
                <li key={item.id}>
                  <details>
                    <summary>
                      <Icon name={item.status === 'PASS' ? 'pass' : 'failed'} />{' '}
                      <strong>{item.id}</strong> {item.title}
                    </summary>
                    <ul className="proof-details">
                      {item.details.map((line) => (
                        <li key={line} className="small">
                          {line}
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </main>
  )
}
