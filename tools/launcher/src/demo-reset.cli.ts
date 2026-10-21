import { ports } from './service.manifest.js'

try {
  const response = await fetch(`http://127.0.0.1:${ports.launcher}/demo/reset`, { method: 'POST' })
  if (!response.ok) throw new Error(await response.text())
  const { loadedCaseIds } = (await response.json()) as { loadedCaseIds: string[] }
  console.log(`demo reset: loaded ${loadedCaseIds.join(', ')}`)
} catch (error) {
  console.error(`demo reset failed: ${error instanceof Error ? error.message : error}`)
  console.error('Is the demo running? Start it with: pnpm start')
  process.exit(1)
}
