import { useEffect, useState } from 'react'
import { api, type ProcessStatus } from './api.js'
import { Icon } from './icons.js'

const slowServices = ['cargo-assurance', 'transport-planning', 'commercial-control']
// Longer than the coordinator's 10 s timeout, so the order shows a technical failure.
const injectedDelayMs = 12_000

export function DemoControls(props: {
  run: (description: string, action: () => Promise<unknown>) => Promise<void>
  lastAction: string | undefined
  resendLastAction: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [processes, setProcesses] = useState<ProcessStatus[]>([])
  const [slowed, setSlowed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!open) return
    const load = () => api.processes().then(setProcesses, () => setProcesses([]))
    load()
    const timer = setInterval(load, 2000)
    return () => clearInterval(timer)
  }, [open])

  const act = (name: string, action: 'kill' | 'start' | 'restart') =>
    props.run(`${action} ${name}`, async () => {
      await api.processAction(name, action)
      setProcesses(await api.processes())
    })

  const slow = (name: string, on: boolean) =>
    props.run(on ? `Slow down ${name}` : `Normal speed for ${name}`, async () => {
      await api.delayService(name, on ? injectedDelayMs : 0)
      setSlowed((current) => ({ ...current, [name]: on }))
    })

  return (
    <details className="demo-controls" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Demo controls</summary>
      <p className="muted small">
        Kill a service to simulate a crash, then start it again: data is kept. For LOG-006, kill the
        coordinator while the quality review is open; after the restart the same task is still
        there.
      </p>
      <ul className="process-list">
        {processes
          .filter((process) => process.name !== 'web')
          .map((process) => (
            <li key={process.name}>
              <span className="process-name">{process.name}</span>
              <span className={`process-state process-${process.state}`}>{process.state}</span>
              <span className="process-actions">
                {process.state === 'running' ? (
                  <button type="button" onClick={() => act(process.name, 'kill')}>
                    <Icon name="kill" /> Kill
                  </button>
                ) : (
                  <button type="button" onClick={() => act(process.name, 'start')}>
                    <Icon name="start" /> Start
                  </button>
                )}
                {slowServices.includes(process.name) && process.state === 'running' && (
                  <button type="button" onClick={() => slow(process.name, !slowed[process.name])}>
                    <Icon name="slow" /> {slowed[process.name] ? 'Normal speed' : 'Slow down'}
                  </button>
                )}
              </span>
            </li>
          ))}
      </ul>
      <p className="muted small">
        "Slow down" makes a service take 12 s, longer than the coordinator waits, so the next action
        ends in a technical failure. Restore normal speed, then use "Re-evaluate".
      </p>
      <button type="button" disabled={!props.lastAction} onClick={props.resendLastAction}>
        <Icon name="resend" /> Send again: {props.lastAction ?? 'nothing yet'}
      </button>
      <p className="muted small">
        Repeats your last action as a duplicate submission; the server applies it once.
      </p>
    </details>
  )
}
