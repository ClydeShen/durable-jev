// Scans the staged changes for secrets before a commit. A Node script rather than shell, so the
// hook runs the same on Windows; without gitleaks installed it says so and lets CI scan instead.
import { spawnSync } from 'node:child_process'

const scan = spawnSync('gitleaks', ['git', '--pre-commit', '--staged', '--redact', '--no-banner'], {
  stdio: 'inherit',
})
if (scan.error?.code === 'ENOENT') {
  process.stdout.write(
    'gitleaks is not installed (mise install adds it), so staged secrets are not scanned here; CI still scans.\n',
  )
  process.exit(0)
}
process.exit(scan.status ?? 1)
