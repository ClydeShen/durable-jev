/** The policy text that defines one rule, as written in the policy document. */
export interface PolicyClause {
  /** The heading the clause sits under, for example "Part A. Order and cargo basics". */
  section: string
  /** The clause paragraph, followed by any later amendment such as "R40 additionally requires R41". */
  paragraphs: string[]
}

const clauseStart = /^\*\*(R\d{2}|[A-Z]+(?:-[A-Z0-9]+)+)\b[^*]*\*\*\s*/

/**
 * Finds each rule's clause in the policy markdown: a paragraph that opens with the rule id in
 * bold. A later bold mention of the same id with no title amends the clause.
 */
export function policyClauses(markdown: string): Map<string, PolicyClause> {
  const clauses = new Map<string, PolicyClause>()
  let section = ''
  for (const paragraph of markdown.split(/\n\s*\n/)) {
    const text = paragraph.replace(/\s*\n\s*/g, ' ').trim()
    const heading = /^#{2,3} (.+)$/.exec(text)
    if (heading) {
      section = heading[1] ?? ''
      continue
    }
    const ruleId = clauseStart.exec(text)?.[1]
    if (!ruleId) continue
    const existing = clauses.get(ruleId)
    if (existing) existing.paragraphs.push(`${section}: ${text.replaceAll('**', '')}`)
    else clauses.set(ruleId, { section, paragraphs: [text.replaceAll('**', '')] })
  }
  return clauses
}
