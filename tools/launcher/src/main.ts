import { controlServer } from './control-server.js'
import { consoleUrl, controlPort, services } from './services.js'
import { Supervisor } from './supervisor.js'

const supervisor = new Supervisor(services)
supervisor.startAll()
controlServer(supervisor).listen(controlPort, 'localhost')
process.stdout.write(
  `[launcher] demo at ${consoleUrl} (MODEL_MODE=${process.env.MODEL_MODE ?? 'scripted'}), control on localhost:${controlPort}\n`,
)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    supervisor.stopAll()
    process.exit(0)
  })
}
