import * as _ from 'lodash'
// import connect from '@holochain/conductor-api'
import logger from './logger'
import * as T from './types'
import { Client as RpcWebSocket } from 'rpc-websockets'
import * as yaml from 'yaml';

export type TrycpClient = {
  dna: (url: string) => Promise<{ path: string }>,
  configure_player: (id, partial_config) => Promise<any>,
  spawn: (id) => Promise<any>,
  kill: (id, signal?) => Promise<any>,
  ping: (id) => Promise<string>,
  reset: () => Promise<void>,
  closeSession: () => Promise<void>,
}

export const trycpSession = async (machineEndpoint: string): Promise<TrycpClient> => {
  const url = `ws://${machineEndpoint}`
  const ws = new RpcWebSocket(url)
  await new Promise((resolve) => ws.once("open", resolve))

  const makeCall = (method) => async (a) => {
    logger.debug(`trycp client request to ${url}: ${method} => ${JSON.stringify(a, null, 2)}`)
    const result = await ws.call(method, a)
    logger.debug('trycp client response: %j', result)
    return result
  }

  return {
    dna: (url) => makeCall('dna')({ url }),
    configure_player: (id, partial_config) => makeCall('configure_player')({
      id, partial_config: yaml.stringify({
        signing_service_uri: partial_config.signing_service_uri !== undefined ? partial_config.signing_service_uri : null,
        encryption_service_uri: partial_config.encryption_service_uri !== undefined ? partial_config.encryption_service_uri : null,
        decryption_service_uri: partial_config.decryption_service_uri !== undefined ? partial_config.decryption_service_uri : null,
        network: partial_config.network !== undefined ? partial_config.network : null,
        dpki: partial_config.dpki !== undefined ? partial_config.dpki : null,
      })
    }),
    spawn: (id) => makeCall('startup')({ id }),
    kill: (id, signal?) => makeCall('shutdown')({ id, signal }),
    ping: () => makeCall('ping')(undefined),
    reset: () => makeCall('reset')(undefined),
    closeSession: () => ws.close(),
  }
}
