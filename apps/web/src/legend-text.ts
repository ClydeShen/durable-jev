import type { CheckStatus } from '@durable-jev/contracts'

/** One line of a graph legend: a colour or mark, its short name, and what it means for the order. */
interface LegendEntry {
  /** A status colour, or one of the highlight colours. */
  colour: CheckStatus | 'upstream' | 'downstream'
  name: string
  meaning: string
}

export interface Legend {
  /** Shown in the small strip on the graph. */
  entries: LegendEntry[]
  /** Colours that only appear with a rule selected; shown when the legend opens. */
  highlights: LegendEntry[]
  /** Shown with the entries when the legend opens: marks and lines that are not a colour. */
  notes: { mark: string; meaning: string }[]
}

const statusEntries: LegendEntry[] = [
  { colour: 'PASS', name: 'Passed', meaning: 'Checked, no problem.' },
  {
    colour: 'FAIL',
    name: 'Failed',
    meaning: 'A problem was found; the order cannot go on until its data changes.',
  },
  {
    colour: 'WAITING_HUMAN',
    name: 'Pending action',
    meaning: 'Someone has to confirm, sign or do field work; it waits for that role.',
  },
  {
    colour: 'BLOCKED_DEPENDENCY',
    name: 'Waits for earlier rules',
    meaning: 'A result it needs is not there yet; it is decided once the earlier rules are.',
  },
  {
    colour: 'INVALIDATED',
    name: 'Invalidated',
    meaning:
      'The order changed; the old result no longer counts and is decided again on the new data.',
  },
  { colour: 'UNKNOWN', name: 'Unknown', meaning: 'Not enough data to decide yet.' },
]

export const ruleLegend: Legend = {
  entries: statusEntries,
  highlights: [
    {
      colour: 'upstream',
      name: 'Upstream',
      meaning: 'With a rule selected: the rules it waits for.',
    },
    {
      colour: 'downstream',
      name: 'Downstream',
      meaning: 'With a rule selected: the rules that use its result.',
    },
  ],
  notes: [
    {
      mark: '↻ r2',
      meaning:
        'Decided again after the order changed to revision 2. After a change, a rule without this mark kept its earlier result.',
    },
    { mark: 'Waits for + role', meaning: 'The rule waits for someone in this role.' },
    {
      mark: 'Grey box',
      meaning: 'The rule does not apply to this order, or its turn has not come.',
    },
    { mark: 'Dashed box', meaning: "Showing one agent: another agent's rule it depends on." },
    {
      mark: 'Specific rules',
      meaning:
        'Import requirements and customer contract terms, which apply only to certain destinations, commodity groups or customers; the graph shows the ones that apply to this order.',
    },
    {
      mark: 'Moving line',
      meaning: 'During playback or selection: a result passing along to the next rule.',
    },
  ],
}

export const agentLegend: Legend = {
  entries: statusEntries.filter((entry) => entry.colour !== 'BLOCKED_DEPENDENCY'),
  highlights: [],
  notes: [
    { mark: 'Card border', meaning: "The agent's most pressing status in this order." },
    {
      mark: 'Arrow',
      meaning: "One agent's rules use another agent's results; the number says how many.",
    },
  ],
}
