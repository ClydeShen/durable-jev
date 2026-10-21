import type { Role } from '@durable-jev/contracts'
import { useState } from 'react'
import { Icon } from '../icons.js'
import { roleLabels } from '../roles.js'
import { currentStepIndex, type GuideState, nameRules, type Scenario } from './scenarios.model.js'

export const GuidePanel = (props: {
  scenario: Scenario
  state: GuideState
  actingRole: Role
  setActingRole: (role: Role) => void
  ruleTitles: ReadonlyMap<string, string>
}) => {
  const { scenario, state } = props
  const named = (text: string) => nameRules(text, props.ruleTitles)
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(new Set())
  const [open, setOpen] = useState(true)
  const current = currentStepIndex(scenario, state, acknowledged)
  const finished = current >= scenario.steps.length

  return (
    <section className="guide" aria-label="Guided scenario">
      <header>
        <h2>
          <Icon name="guide" /> {scenario.title}
        </h2>
        <span className="muted small">
          {finished ? 'Complete' : `Step ${current + 1} of ${scenario.steps.length}`}
        </span>
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide guide' : 'Show guide'}
        </button>
      </header>
      {open && (
        <>
          <p className="muted small">Shows: {scenario.shows}</p>
          <ol className="guide-steps">
            {scenario.steps.map((step, index) => {
              const status = index < current ? 'done' : index === current ? 'current' : 'todo'
              return (
                <li key={step.id} className={`guide-step guide-${status}`}>
                  <span className="guide-marker">
                    <Icon
                      name={status === 'done' ? 'pass' : status === 'current' ? 'open' : 'todo'}
                    />
                  </span>
                  <div>
                    <strong>{named(step.title)}</strong>
                    {status === 'current' && (
                      <>
                        <p>{named(step.instruction)}</p>
                        {step.fill && (
                          <p className="small">
                            Type:{' '}
                            {Object.entries(step.fill).map(([field, value]) => (
                              <code key={field} className="guide-fill">
                                {field} = {value}
                              </code>
                            ))}
                          </p>
                        )}
                        <p className="muted small">You should see: {named(step.expect)}</p>
                        <div className="row">
                          {step.role && (
                            <button
                              type="button"
                              disabled={props.actingRole === step.role}
                              onClick={() => step.role && props.setActingRole(step.role)}
                            >
                              <Icon name="waiting" />{' '}
                              {props.actingRole === step.role
                                ? `Acting as ${roleLabels[step.role]}`
                                : `Act as ${roleLabels[step.role]}`}
                            </button>
                          )}
                          {(!step.done || step.id === 'wrong-role') && (
                            <button
                              type="button"
                              onClick={() => setAcknowledged(new Set([...acknowledged, step.id]))}
                            >
                              <Icon name="approve" /> Done
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
          {finished && (
            <p className="guide-complete">
              <Icon name="pass" /> Scenario complete. Pick another order, or open the Console to see
              how this one was recorded.
            </p>
          )}
        </>
      )}
    </section>
  )
}
