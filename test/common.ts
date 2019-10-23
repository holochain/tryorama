const sinon = require('sinon')
import * as T from '../src/types'

import { Orchestrator, Config } from '../src'

export const testConfig = () => {

  const dna = Config.dna(
    'https://github.com/holochain/passthrough-dna/releases/download/v0.0.5/passthrough-dna.dna.json'
  )
  const network = { type: 'sim2h', sim2h_url: 'http://localhost:9000' }
  const args: T.GlobalConfig = { logger: true, network }
  console.warn("Be sure to run a local sim2h server on port 9000 before running these tests!")

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

export const genConfigArgs: () => Promise<T.GenConfigArgs> = async () => ({
  configDir: 'config/dir',
  adminPort: 1000,
  zomePort: 2000,
  conductorName: 'conductorName',
  uuid: 'uuid',
})
export const spawnConductor = (() => { }) as unknown as T.SpawnConductorFn
