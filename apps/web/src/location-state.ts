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
