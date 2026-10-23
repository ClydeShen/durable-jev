import { useEffect, useRef, useState } from 'react'
import { type A2aAgentCard, api } from '../api'
import { Chip, Tag } from './chips'
import { Field, Fields, Section } from './ui'

const yesNo = (value?: boolean) => (value ? 'Yes' : 'No')

function CardBody({ card }: { card: A2aAgentCard }) {
  return (
    <>
      <Section title="Profile">
        <Fields>
          <Field label="Name">{card.name}</Field>
          <Field label="Description">{card.description}</Field>
          <Field label="Version">{card.version}</Field>
          {card.supportedInterfaces.map((endpoint) => (
            <Field key={endpoint.url} label="Endpoint">
              <span className="chips">
                <Chip>{endpoint.url}</Chip>
                <Tag>
                  {endpoint.protocolBinding} · A2A {endpoint.protocolVersion}
                </Tag>
              </span>
            </Field>
          ))}
          <Field label="Input / output">
            {card.defaultInputModes.join(', ')} / {card.defaultOutputModes.join(', ')}
          </Field>
          <Field label="Streaming">{yesNo(card.capabilities.streaming)}</Field>
          <Field label="Push notifications">{yesNo(card.capabilities.pushNotifications)}</Field>
        </Fields>
      </Section>
      <Section title={`Skills (${card.skills.length})`}>
        <ul className="a2a-skills">
          {card.skills.map((skill) => (
            <li key={skill.id}>
              <span className="a2a-skill-name">
                <strong>{skill.name}</strong>
                <Chip>{skill.id}</Chip>
              </span>
              <span className="muted">{skill.description}</span>
            </li>
          ))}
        </ul>
      </Section>
      <details className="a2a-raw">
        <summary>Raw JSON</summary>
        <pre>{JSON.stringify(card, null, 2)}</pre>
      </details>
    </>
  )
}

/** An agent's A2A Agent Card: what any A2A client discovers before calling it. */
export function A2aCardDialog({
  agentId,
  cardUrl,
  onClose,
}: {
  agentId: string
  cardUrl: string
  onClose(): void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [card, setCard] = useState<A2aAgentCard>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    dialog.current?.showModal()
    api.agentCard(agentId).then(setCard, (failure: Error) => setError(failure.message))
  }, [agentId])
  return (
    <dialog
      ref={dialog}
      className="a2a-dialog"
      aria-label="A2A Agent Card"
      onClose={onClose}
      // Escape closes this dialog only, not the drawer under it.
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        if (event.target === dialog.current) dialog.current.close()
      }}
    >
      <header className="drawer-header">
        <div className="drawer-heading">
          <h3>A2A Agent Card</h3>
          <Chip>{cardUrl}</Chip>
        </div>
        <button type="button" className="secondary small" onClick={() => dialog.current?.close()}>
          Close
        </button>
      </header>
      <div className="drawer-body">
        {error && <p className="message error">{error}</p>}
        {card ? <CardBody card={card} /> : !error && <p className="muted">Loading…</p>}
      </div>
    </dialog>
  )
}
