import { createControlApp } from './control-app.js'
import { resetDemo } from './demo-reset.js'
import { openInBrowser } from './open-browser.helpers.js'
import { ProcessSupervisor } from './process-supervisor.js'
import { ports, serviceManifest } from './service-manifest.js'

const supervisor = new ProcessSupervisor(serviceManifest)
await supervisor.startAll()

const controlServer = createControlApp(supervisor).listen(ports.launcher, '127.0.0.1', () => {
  console.log('')
  console.log('durable-jev is running')
  console.log(`  ${'workbench'.padEnd(12)} http://127.0.0.1:${ports.web}/`)
  console.log(`  ${'coordinator'.padEnd(12)} http://127.0.0.1:${ports.coordinator}/cases`)
  for (const [name, port] of [
    ['cargo', ports.cargoAssurance],
    ['transport', ports.transportPlanning],
    ['commercial', ports.commercialControl],
  ] as const) {
    console.log(`  ${name.padEnd(12)} http://127.0.0.1:${port}/capabilities`)
  }
  console.log(`  ${'observe'.padEnd(12)} http://127.0.0.1:${ports.observability}/cases`)
  console.log(`  ${'control'.padEnd(12)} http://127.0.0.1:${ports.launcher}/processes`)
  console.log('')
  console.log('Load demo cases with: pnpm demo:reset')
})

// A fresh install starts with nothing to look at: load the demo orders once.
const existing = await fetch(`http://127.0.0.1:${ports.coordinator}/cases`)
  .then((response) => response.json() as Promise<unknown[]>)
  .catch(() => undefined)
if (existing?.length === 0) {
  await resetDemo(supervisor)
  console.log('Loaded the demo orders.')
}
if (process.argv.includes('--open')) openInBrowser(`http://127.0.0.1:${ports.web}/`)

const shutdown = async () => {
  controlServer.close()
  await supervisor.stopAll()
  process.exit(0)
}
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
