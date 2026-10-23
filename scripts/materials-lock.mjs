// Records a hash of every protected source file in eval/materials.lock.json: the PRD, the policy,
// the rules and the test materials. With --check it fails instead when a protected file changed
// since the lock was written, so such a change needs a deliberate `pnpm materials:lock`.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const lockFile = 'eval/materials.lock.json'
const protectedPaths = ['.harness/prd.md', 'eval/materials']

function filesUnder(path) {
  if (!statSync(root + path).isDirectory()) return [path]
  return readdirSync(root + path).flatMap((name) => filesUnder(`${path}/${name}`))
}

const hashes = Object.fromEntries(
  protectedPaths
    .flatMap(filesUnder)
    .sort()
    .map((file) => [
      file,
      // Line endings are normalised, so a Windows checkout with CRLF hashes the same as CI.
      createHash('sha256')
        .update(readFileSync(root + file, 'utf8').replaceAll('\r\n', '\n'))
        .digest('hex'),
    ]),
)
const lock = `${JSON.stringify(hashes, null, 2)}\n`

if (process.argv.includes('--check')) {
  const locked = JSON.parse(readFileSync(root + lockFile, 'utf8'))
  const changed = [...new Set([...Object.keys(locked), ...Object.keys(hashes)])].filter(
    (file) => locked[file] !== hashes[file],
  )
  if (changed.length > 0) {
    process.stderr.write(
      `Protected files changed: ${changed.join(', ')}\n` +
        'If the change is approved, run pnpm materials:lock and commit the lock with it.\n',
    )
    process.exit(1)
  }
} else {
  writeFileSync(root + lockFile, lock)
}
