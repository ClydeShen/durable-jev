import { useEffect, useState } from 'react'
import { ApiError, api, type ProcessStatus } from './api.js'
import { Icon } from './icons.js'

const slowServices = ['cargo-assurance', 'transport-planning', 'commercial-control']
// Longer than the coordinator's 10 s timeout, so the order shows a technical failure.
const injectedDelayMs = 12_000

export function DemoControls(props: {
  // The order on screen, for the two-changes-at-once drill.
  selectedCase: { caseId: string; revision: number; amountCents: number } | undefined
  run: (description: string, action: () => Promise<unknown>) => Promise<void>
  lastAction: string | undefined
  resendLastAction: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [processes, setProcesses] = useState<ProcessStatus[]>([])
  const [slowed, setSlowed] = useState<Record<string, boolean>>({})
  const [jevDown, setJevDown] = useState(false)
  const [raceResult, setRaceResult] = useState<string>()

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

  const setJev = (down: boolean) =>
    props.run(down ? 'Make Jev unavailable' : 'Make Jev available', async () => {
      await Promise.all(slowServices.map((name) => api.setJudgeUnavailable(name, down)))
      setJevDown(down)
    })

  // Two plan changes based on the same revision, sent at the same time.
  const quoteRace = () =>
    props.run('Two quote changes at once', async () => {
      const order = props.selectedCase
      if (!order) throw new Error('select an order first')
      const send = (extraCents: number) =>
        api
          .applyChange(
            order.caseId,
            { kind: 'changeQuote', amountCents: order.amountCents + extraCents },
            'COMMERCIAL_MANAGER',
            order.revision,
          )
          .then(
            () => 'applied',
            (error: unknown) =>
              error instanceof ApiError ? `refused (${error.status})` : 'failed',
          )
      const results = await Promise.all([send(100), send(200)])
      setRaceResult(`First change: ${results[0]}. Second change: ${results[1]}.`)
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
      <h3>Fault drills</h3>
      <p className="muted small">
        "Jev unavailable" makes every semantic question fail, as if the model were down. Click
        "Re-evaluate" on an order that asks the model (for example LOG-006): it shows a technical
        failure and no rule passes. Switch Jev back on and re-evaluate to recover.
      </p>
      <button type="button" aria-pressed={jevDown} onClick={() => setJev(!jevDown)}>
        <Icon name={jevDown ? 'start' : 'kill'} />{' '}
        {jevDown ? 'Jev available again' : 'Jev unavailable'}
      </button>
      <p className="muted small">
        "Two changes at once" sends two quote changes for the order on screen, both based on the
        same revision. One is applied; the other is refused so nothing is lost.
      </p>
      <button type="button" disabled={!props.selectedCase} onClick={quoteRace}>
        <Icon name="resend" /> Two changes at once
      </button>
      {raceResult && <p className="small">{raceResult}</p>}
      <button type="button" disabled={!props.lastAction} onClick={props.resendLastAction}>
        <Icon name="resend" /> Send again: {props.lastAction ?? 'nothing yet'}
      </button>
      <p className="muted small">
        Repeats your last action as a duplicate submission; the server applies it once.
      </p>
    </details>
  )
}
