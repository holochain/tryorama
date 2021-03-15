const sinon = require('sinon')
import * as T from '../src/types'

import { Orchestrator, Config } from '../src'
import { spawnTest } from '../src/config'

export const testOrchestrator = () => new Orchestrator({
  mode: {
    executor: 'none',
    spawning: 'local',
  }
})

export const testConfig = (dnaPath: string) => {
  const seed: T.ConfigSeed = Config.gen({
    network: {
      network_type: T.NetworkType.QuicBootstrap,
      transport_pool: [{
        type: T.TransportConfigType.Quic,
      }],
    }}
  )
  const install: T.InstallAgentsHapps = [
    // agent 0
    [
      // happ 0
      [dnaPath]
    ]
  ]
  return [seed, install]
}

export const withClock = f => t => {
  const clock = sinon.useFakeTimers()
  try {
    f(t, clock)
  } finally {
    clock.runAll()
    clock.restore()
  }
}

export const genConfigArgs: () => Promise<T.ConfigSeedArgs> = async () => ({
  configDir: 'config/dir',
  adminInterfacePort: 1000,
  playerName: 'playerName',
  scenarioName: 'scenarioName',
  uuid: 'uuid',
})
export const spawnConductor = (() => { }) as unknown as T.SpawnConductorFn
