import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const baselinePath = join(import.meta.dirname, 'baseline.json')
const roles = [
  'types',
  'schema',
  'rules',
  'evaluator',
  'judge',
  'service',
  'routes',
  'client',
  'repository',
  'migrations',
  'runtime',
  'tools',
  'model',
  'helpers',
  'config',
  'app',
  'cli',
  'fixture',
  'test',
  'page',
  'panel',
  'view',
  'node',
  'component',
  'hook',
]
const exactNames = ['index.ts', 'main.ts', 'main.tsx']
const skipped = new Set(['node_modules', 'dist', 'var', '.git', '.claude', '.harness'])

const walk = (directory) =>
  readdirSync(directory).flatMap((name) => {
    if (skipped.has(name)) return []
    const path = join(directory, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })

const sourceFiles = walk(root)
  .filter((path) => /[\\/]src[\\/].*\.(ts|tsx)$/.test(path))
  .map((path) => relative(root, path).split('\\').join('/'))

const hasRole = (file) => {
  const name = basename(file)
  if (exactNames.includes(name)) return true
  const parts = name.replace(/\.(ts|tsx)$/, '').split('.')
  return parts.length >= 2 && roles.includes(parts[parts.length - 1])
}

const declaration = /^\s*(export\s+)?(default\s+)?(async\s+)?function\b/
const functionDeclarations = sourceFiles.flatMap((file) => {
  const lines = readFileSync(join(root, file), 'utf8').split('\n')
  return lines.flatMap((line, index) =>
    declaration.test(line) && !/function-declaration:/.test(lines[index - 1] ?? '')
      ? [`${file}:${index + 1}`]
      : [],
  )
})
const misnamed = sourceFiles.filter((file) => !hasRole(file))

const current = {
  functionDeclarationCounts: Object.fromEntries(
    Object.entries(
      Object.groupBy(functionDeclarations, (entry) => entry.slice(0, entry.lastIndexOf(':'))),
    ).map(([file, entries]) => [file, entries.length]),
  ),
  filesWithoutRole: misnamed,
}

if (process.argv.includes('--update')) {
  writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`)
  console.log(
    `baseline written: ${functionDeclarations.length} function declarations, ${misnamed.length} files without a role suffix`,
  )
  process.exit(0)
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
const problems = []
for (const [file, count] of Object.entries(current.functionDeclarationCounts)) {
  const allowed = baseline.functionDeclarationCounts[file] ?? 0
  if (count > allowed)
    problems.push(
      `${file}: ${count} function declarations (allowed ${allowed}); use an arrow function`,
    )
}
for (const file of current.filesWithoutRole)
  if (!baseline.filesWithoutRole.includes(file))
    problems.push(`${file}: file name has no role suffix (see docs/conventions.md)`)

const remaining = functionDeclarations.length + misnamed.length
if (problems.length > 0) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`conventions ok; ${remaining} older items still to migrate (see baseline.json)`)
