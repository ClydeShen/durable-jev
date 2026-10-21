export type ProofItem = {
  status: 'PASS' | 'FAIL'
  id: string
  title: string
  details: string[]
}

export type ProofOutput = { items: ProofItem[]; summary: string | undefined }

// Reads what `pnpm replay` and `pnpm faults` print: one "PASS|FAIL  <id>  <title>" line per
// item, indented lines that belong to it, and a closing "n/m ... passed" line.
export const parseProofOutput = (text: string): ProofOutput => {
  const items: ProofItem[] = []
  let summary: string | undefined
  for (const line of text.split('\n')) {
    const item = /^(PASS|FAIL)\s+(\S+)\s+(.*)$/.exec(line)
    if (item) {
      items.push({
        status: item[1] as ProofItem['status'],
        id: item[2] ?? '',
        title: (item[3] ?? '').trim(),
        details: [],
      })
    } else if (/^\d+\/\d+ .*passed/.test(line)) {
      summary = line.trim()
    } else if (/^\s+\S/.test(line)) {
      items[items.length - 1]?.details.push(line.trim())
    }
  }
  return { items, summary }
}
