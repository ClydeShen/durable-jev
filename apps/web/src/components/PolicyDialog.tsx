import { useEffect, useState } from 'react'
import { api, type PolicyText } from '../api'
import { Chip } from './chips'
import { Modal } from './ui'

/** Inline text with its bold rule titles and `parameter` names kept. */
function Inline({ text }: { text: string }) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, index) => {
    const key = `${index}:${part}`
    if (part.startsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`')) return <code key={key}>{part.slice(1, -1)}</code>
    return part
  })
}

const cellsOf = (row: string) =>
  row
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim())

/** A markdown table: its first row is the header, the dashed row under it is dropped. */
function Table({ rows }: { rows: string[] }) {
  const [header = '', , ...body] = rows
  const columns = cellsOf(header)
  return (
    <table className="policy-table">
      <thead>
        <tr>
          {columns.map((cell) => (
            <th key={cell}>
              <Inline text={cell} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {body.map((row) => (
          <tr key={row}>
            {cellsOf(row)
              .map((cell, index) => ({ column: columns[index], cell }))
              .map(({ column, cell }) => (
                <td key={column}>
                  <Inline text={cell} />
                </td>
              ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** One block of the policy: a table, a list or a paragraph. */
function Block({ text }: { text: string }) {
  const lines = text.split('\n')
  if (text.startsWith('|')) return <Table rows={lines} />
  if (text.startsWith('- ')) {
    return (
      <ul>
        {lines.map((line) => (
          <li key={line}>
            <Inline text={line.slice(2)} />
          </li>
        ))}
      </ul>
    )
  }
  return (
    <p>
      <Inline text={text} />
    </p>
  )
}

const anchorOf = (heading: string) => `policy-${heading.replace(/[^A-Za-z0-9]+/g, '-')}`

function PolicyBody({ policy }: { policy: PolicyText }) {
  const parts = policy.sections.filter((section) => section.level === 2)
  return (
    <article className="policy-text">
      <h2>{policy.title}</h2>
      {policy.preamble.map((text) => (
        <Block key={text} text={text} />
      ))}
      <nav className="policy-index" aria-label="Policy sections">
        {parts.map((section) => (
          <a key={section.heading} href={`#${anchorOf(section.heading)}`}>
            {section.heading}
          </a>
        ))}
      </nav>
      {policy.sections.map((section) => (
        <section key={section.heading} id={anchorOf(section.heading)}>
          {section.level === 2 ? <h3>{section.heading}</h3> : <h4>{section.heading}</h4>}
          {section.paragraphs.map((text) => (
            <Block key={text} text={text} />
          ))}
        </section>
      ))}
    </article>
  )
}

/** The policy as people wrote it, the text every rule was authored from. */
export function PolicyDialog({ onClose }: { onClose(): void }) {
  const [policy, setPolicy] = useState<PolicyText>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    api.policy().then(setPolicy, (failure: Error) => setError(failure.message))
  }, [])
  return (
    <Modal title="Policy" aside={policy && <Chip>{policy.version}</Chip>} wide onClose={onClose}>
      {error && <p className="message error">{error}</p>}
      {policy ? <PolicyBody policy={policy} /> : !error && <p className="muted">Loading…</p>}
    </Modal>
  )
}
