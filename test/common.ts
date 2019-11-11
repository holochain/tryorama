const sinon = require('sinon')
import * as T from '../src/types'

import { Orchestrator, Config } from '../src'

export const testConfig = () => {

  const dna = Config.dna(
    'https://github.com/holochain/holochain-basic-chat/releases/download/0.0.15/holochain-basic-chat.dna.json'
  )
  const network = 'n3h'
  const metric_publisher = 'logger'
  // const network = { type: 'sim1h', dynamo_url: 'http://localhost:8000' }
  const args: T.GlobalConfig = { logger: false, network, metric_publisher }

  return {
    alice: Config.genConfig({
      instances: {
        chat: dna
      },
    }, args),
    bob: Config.genConfig({
      instances: {
        chat: dna
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
