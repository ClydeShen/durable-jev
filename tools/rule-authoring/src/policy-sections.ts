export interface PolicySection {
  title: string
  text: string
}

function policySections(markdown: string): PolicySection[] {
  return markdown
    .split(/^## /m)
    .slice(1)
    .map((chunk) => {
      const [title = '', ...body] = chunk.split('\n')
      return { title: title.trim(), text: body.join('\n').trim() }
    })
}

export function ruleIdsIn(text: string): string[] {
  return [
    ...new Set(
      [...text.matchAll(/\*\*(R\d{2}|[A-Z]+(?:-[A-Z0-9]+)+)\b/g)].map(
        (match) => match[1] as string,
      ),
    ),
  ]
}

export function selectPolicy(markdown: string, selector: string): PolicySection {
  const sections = policySections(markdown)
  const clauses = sections
    .flatMap((entry) => entry.text.split(/\n\s*\n/))
    .filter((paragraph) => paragraph.startsWith(`**${selector} `))
  if (clauses.length > 0) return { title: `Rule ${selector}`, text: clauses.join('\n\n') }
  const section = sections.find((candidate) => candidate.title.startsWith(selector))
  if (!section) throw new Error(`no policy rule or section matching "${selector}"`)
  return section
}
