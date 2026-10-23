/** One heading of the policy and the paragraphs under it, as written (with `**` and backticks). */
interface PolicySection {
  heading: string
  /** 2 for a part or appendix, 3 for a subsection such as one destination. */
  level: 2 | 3
  paragraphs: string[]
}

/** The policy document as people wrote it: the text the rules were authored from. */
export interface PolicyDocument {
  title: string
  /** The paragraphs before the first section. */
  preamble: string[]
  sections: PolicySection[]
}

/** The policy text that defines one rule, as written in the policy document. */
export interface PolicyClause {
  /** The heading the clause sits under, for example "Part A. Order and cargo basics". */
  section: string
  /** The clause paragraph, followed by any later amendment such as "R40 additionally requires R41". */
  paragraphs: string[]
}

/** Splits the policy markdown into its title, preamble and sections of joined-up paragraphs. */
export function policyDocument(markdown: string): PolicyDocument {
  const document: PolicyDocument = { title: '', preamble: [], sections: [] }
  for (const paragraph of markdown.split(/\n\s*\n/)) {
    const text = paragraph.replace(/\s*\n\s*/g, ' ').trim()
    if (!text) continue
    const heading = /^(#{1,3}) (.+)$/.exec(text)
    const hashes = heading?.[1]?.length
    if (heading && hashes === 1) document.title = heading[2] ?? ''
    else if (heading) {
      document.sections.push({
        heading: heading[2] ?? '',
        level: hashes === 2 ? 2 : 3,
        paragraphs: [],
      })
    } else (document.sections.at(-1)?.paragraphs ?? document.preamble).push(text)
  }
  return document
}

const clauseStart = /^\*\*(R\d{2}|[A-Z]+(?:-[A-Z0-9]+)+)\b[^*]*\*\*\s*/

/**
 * Finds each rule's clause in the policy: a paragraph that opens with the rule id in bold. A
 * later bold mention of the same id with no title amends the clause.
 */
export function policyClauses(document: PolicyDocument): Map<string, PolicyClause> {
  const clauses = new Map<string, PolicyClause>()
  for (const { heading, paragraphs } of document.sections) {
    for (const text of paragraphs) {
      const ruleId = clauseStart.exec(text)?.[1]
      if (!ruleId) continue
      const existing = clauses.get(ruleId)
      if (existing) existing.paragraphs.push(`${heading}: ${text.replaceAll('**', '')}`)
      else clauses.set(ruleId, { section: heading, paragraphs: [text.replaceAll('**', '')] })
    }
  }
  return clauses
}
