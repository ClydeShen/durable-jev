// The selected case and view live in the URL hash (#/cases/CASE-LOG-003?view=tree), so a
// reload keeps the place and a link opens the same screen.
export type LocationState = { caseId: string | undefined; view: 'flow' | 'tree' }

export function parseLocation(hash: string): LocationState {
  const [path = '', query = ''] = hash.replace(/^#/, '').split('?')
  const caseId = /^\/cases\/([^/]+)$/.exec(path)?.[1]
  const view = new URLSearchParams(query).get('view') === 'tree' ? 'tree' : 'flow'
  return { caseId: caseId ? decodeURIComponent(caseId) : undefined, view }
}

export function formatLocation(state: LocationState): string {
  if (!state.caseId) return ''
  const query = state.view === 'tree' ? '?view=tree' : ''
  return `#/cases/${encodeURIComponent(state.caseId)}${query}`
}

export type ConsoleTab = 'timeline' | 'calls' | 'judgements' | 'recovery'
export type ConsoleLocation = {
  correlationId: string | undefined
  tab: ConsoleTab
  // Highlight one rule (from a rule node in the workbench) or one trace.
  rule: string | undefined
  trace: string | undefined
}

const consoleTabs: readonly ConsoleTab[] = ['timeline', 'calls', 'judgements', 'recovery']

export const isConsoleHash = (hash: string) => hash.startsWith('#/console')

export function parseConsoleLocation(hash: string): ConsoleLocation {
  const [path = '', query = ''] = hash.replace(/^#/, '').split('?')
  const params = new URLSearchParams(query)
  const correlationId = /^\/console\/([^/]+)$/.exec(path)?.[1]
  const tab = consoleTabs.find((candidate) => candidate === params.get('tab')) ?? 'timeline'
  return {
    correlationId: correlationId ? decodeURIComponent(correlationId) : undefined,
    tab,
    rule: params.get('rule') ?? undefined,
    trace: params.get('trace') ?? undefined,
  }
}

export function formatConsoleLocation(state: Partial<ConsoleLocation>): string {
  const params = new URLSearchParams()
  if (state.tab && state.tab !== 'timeline') params.set('tab', state.tab)
  if (state.rule) params.set('rule', state.rule)
  if (state.trace) params.set('trace', state.trace)
  const query = params.toString()
  const base = state.correlationId
    ? `#/console/${encodeURIComponent(state.correlationId)}`
    : '#/console'
  return query ? `${base}?${query}` : base
}
