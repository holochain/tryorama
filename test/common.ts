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

export const testConfig = () => {

  const dna = Config.dna(
    'https://github.com/holochain/passthrough-dna/releases/download/v0.0.5/passthrough-dna.dna.json'
  )

  ///////////////////////////////// For local tests
  // const network = { type: 'sim2h', sim2h_url: 'ws://localhost:9000' }
  // console.warn("Be sure to run a local sim2h server on port 9000 before running these tests!")

  //////////////////////////////// For local docker tests
  const network = { type: 'sim2h', sim2h_url: 'ws://sim2h:9000' }
  console.warn("Be sure to run a docker container named 'sim2h' on the 'trycp' network on port 9000 before running these tests!")


  // const network = 'n3h'
  const args: T.GlobalConfig = { logger: true, network }

  return {
    alice: Config.genConfig({
      instances: {
        app: dna
      },
    }, args),
    bob: Config.genConfig({
      instances: {
        app: dna
      }
    }, args)
  }
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
  urlBase: 'http://localhost',
  adminPort: 1000,
  zomePort: 2000,
  playerName: 'playerName',
  uuid: 'uuid',
})
export const spawnConductor = (() => { }) as unknown as T.SpawnConductorFn
