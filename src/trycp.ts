import * as _ from 'lodash'
import { connect } from '@holochain/hc-web-client'
import logger from './logger'
import * as T from './types'
const base64 = require('base-64')
const TOML = require('@iarna/toml')

export type TrycpClient = {
  setup: (id) => Promise<T.PartialConfigSeedArgs>,
  dna: (url: string) => Promise<{path: string}>,
  player: (id, config: T.RawConductorConfig) => Promise<any>,
  spawn: (id) => Promise<any>,
  kill: (id, signal?) => Promise<any>,
  ping: (id) => Promise<string>,
  reset: () => Promise<void>,
  closeSession: () => Promise<void>,
}

export const trycpSession = async (url): Promise<TrycpClient> => {
  const { call, close } = await connect({ url })

  const makeCall = (method) => async (a) => {
    logger.debug(`trycp client request to ${url}: ${method} => ${JSON.stringify(a, null, 2)}`)
    const result = await call(method)(a)
    logger.debug('trycp client response: %j', result)
    return result
  }

  return {
    setup: (id) => makeCall('setup')({ id }),
    dna: (url) => makeCall('dna')({ url }),
    player: (id, config) => makeCall('player')({ id, config: base64.encode(TOML.stringify(config)) }),
    spawn: (id) => makeCall('spawn')({ id }),
    kill: (id, signal?) => makeCall('kill')({ id, signal }),
    ping: (id) => makeCall('ping')({ id }),
    reset: () => makeCall('reset')({}),
    closeSession: () => close(),
  }
}
