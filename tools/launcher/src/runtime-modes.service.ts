import type { ProcessSupervisor } from './process-supervisor.service.js'

export type RuntimeModes = {
  branchProtocol: 'native' | 'a2a'
  modelMode: 'scripted' | 'live'
}

const branchServices = ['cargo-assurance', 'transport-planning', 'commercial-control']

// The two switches the demo needs without a restart of the whole stack. Data is kept: only the
// processes whose settings changed are restarted.
export const createRuntimeModes = (
  supervisor: ProcessSupervisor,
  environment: NodeJS.ProcessEnv = process.env,
) => {
  const current: RuntimeModes = {
    branchProtocol: environment.BRANCH_PROTOCOL === 'a2a' ? 'a2a' : 'native',
    modelMode: environment.MODEL_MODE === 'live' ? 'live' : 'scripted',
  }
  const liveAvailable = () => Boolean(environment.TYPESAFE_API_KEY)

  const set = async (
    wanted: Partial<RuntimeModes>,
  ): Promise<{ ok: true } | { ok: false; reason: string }> => {
    if (wanted.modelMode === 'live' && !liveAvailable())
      return { ok: false, reason: 'Live mode needs TYPESAFE_API_KEY in the environment.' }
    const modelChanged = wanted.modelMode !== undefined && wanted.modelMode !== current.modelMode
    const protocolChanged =
      wanted.branchProtocol !== undefined && wanted.branchProtocol !== current.branchProtocol
    if (!modelChanged && !protocolChanged) return { ok: true }
    if (modelChanged && wanted.modelMode) current.modelMode = wanted.modelMode
    if (protocolChanged && wanted.branchProtocol) current.branchProtocol = wanted.branchProtocol

    const env = { BRANCH_PROTOCOL: current.branchProtocol, MODEL_MODE: current.modelMode }
    await supervisor.stop('coordinator')
    if (modelChanged) for (const name of branchServices) await supervisor.stop(name)
    for (const name of [...branchServices, 'coordinator']) supervisor.updateEnv(name, env)
    if (modelChanged) for (const name of branchServices) await supervisor.start(name)
    await supervisor.start('coordinator')
    return { ok: true }
  }

  return { get: () => ({ ...current, liveAvailable: liveAvailable() }), set }
}
