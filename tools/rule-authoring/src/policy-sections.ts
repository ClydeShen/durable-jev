export interface PolicySection {
  title: string
  text: string
}

export function policySections(markdown: string): PolicySection[] {
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
