import { consoleUrl } from './services.js'

const response = await fetch(`${consoleUrl}/api/demo/reset`, { method: 'POST' }).catch(
  () => undefined,
)
if (!response?.ok) {
  process.stderr.write(`demo reset failed: is the demo running at ${consoleUrl}? (pnpm start)\n`)
  process.exit(1)
}
process.stdout.write(`demo reset: ${JSON.stringify(await response.json())}\n`)
