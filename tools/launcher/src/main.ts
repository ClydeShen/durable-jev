import { controlServer } from './control-server.js'
import { openBrowser, readyBanner, waitUntilReady } from './ready.js'
import { consoleUrl, controlPort, services } from './services.js'
import { Supervisor } from './supervisor.js'

const supervisor = new Supervisor(services)
supervisor.startAll()
controlServer(supervisor).listen(controlPort, 'localhost')
const modelMode = process.env.MODEL_MODE ?? 'scripted'
process.stdout.write(`[launcher] starting the demo (MODEL_MODE=${modelMode}) …\n`)
void waitUntilReady(consoleUrl).then((ready) => {
  if (!ready) {
    process.stdout.write(
      `[launcher] the console did not answer at ${consoleUrl}; see the log above\n`,
    )
    return
  }
  process.stdout.write(readyBanner(consoleUrl, modelMode))
  openBrowser(consoleUrl)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    supervisor.stopAll()
    process.exit(0)
  })
}
