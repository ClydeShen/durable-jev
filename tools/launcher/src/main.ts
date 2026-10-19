import { createControlApp } from './control-app.js'
import { ProcessSupervisor } from './process-supervisor.js'
import { ports, serviceManifest } from './service-manifest.js'

const supervisor = new ProcessSupervisor(serviceManifest)
await supervisor.startAll()

const controlServer = createControlApp(supervisor).listen(ports.launcher, '127.0.0.1', () => {
  console.log('')
  console.log('durable-jev is running')
  for (const status of supervisor.status()) {
    console.log(`  ${status.name.padEnd(12)} ${status.healthUrl?.replace('/health', '')}`)
  }
  console.log(`  ${'control'.padEnd(12)} http://127.0.0.1:${ports.launcher}/processes`)
  console.log('')
  console.log('Load demo cases with: pnpm demo:reset')
})

const shutdown = async () => {
  controlServer.close()
  await supervisor.stopAll()
  process.exit(0)
}
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
