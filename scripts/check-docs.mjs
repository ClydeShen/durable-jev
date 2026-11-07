import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)))
const read = (path) => readFileSync(path, 'utf8')
const markdown = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return markdown(path)
    return path.endsWith('.md') ? [path] : []
  })
const files = ['README.md', 'AGENTS.md'].map((path) => join(root, path))
files.push(...markdown(join(root, 'docs')), ...markdown(join(root, '.harness')))
const standard = join(root, '.harness/README.md')
const register = read(standard).split('## Document ownership')[1]?.split('## Lifecycle')[0] ?? ''
const entries = [...register.matchAll(/^\| \[[^\]]+\]\(([^)]+\.md)\) \|/gm)]
const registered = entries.map((entry) => resolve(dirname(standard), entry[1]))
const problems = []
for (const file of files) {
  if (registered.filter((entry) => entry === file).length !== 1) {
    problems.push(`${file}: needs exactly one ownership entry`)
  }
}
for (const file of registered) {
  if (!files.includes(file)) problems.push(`${file}: ownership entry has no document in scope`)
}

function headingIds(path) {
  const seen = new Map()
  const ids = new Set()
  const content = read(path).replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, '')
  for (const match of content.matchAll(/^#{1,6} +(.+)$/gm)) {
    const slug = match[1]
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_ -]/gu, '')
      .replaceAll(' ', '-')
    const count = seen.get(slug) ?? 0
    ids.add(count ? `${slug}-${count}` : slug)
    seen.set(slug, count + 1)
  }
  return ids
}

let checked = 0
for (const file of files) {
  for (const match of read(file).matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1]
    if (/^[a-z][a-z\d+.-]*:/i.test(target)) continue
    const [path, anchor] = target.split('#')
    const destination = path ? resolve(dirname(file), decodeURIComponent(path)) : file
    checked++
    if (!existsSync(destination)) problems.push(`${file}: missing target ${target}`)
    else if (
      anchor &&
      destination.endsWith('.md') &&
      !headingIds(destination).has(decodeURIComponent(anchor))
    ) {
      problems.push(`${file}: missing heading ${target}`)
    }
  }
}
if (problems.length) {
  process.stderr.write(`${problems.join('\n')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`${files.length} documents registered; ${checked} local links verified.\n`)
}
