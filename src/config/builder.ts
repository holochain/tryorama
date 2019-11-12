const path = require('path')
import * as _ from 'lodash'
import * as T from '../types'
import { dnaPathToId, mkdirIdempotent } from './common'
import { gen } from './gen'
import { saneLoggerConfig, quietLoggerConfig } from './logger'

const genDnaConfig = (file, id?, opts = {}): T.DnaConfig => {
  if (!id) {
    id = dnaPathToId(file)
  }
  return { file, id, ...opts }
}

const genDpkiConfig = (instanceId: string, initParams: Record<string, any>) => ({
  instance_id: instanceId,
  init_params: JSON.stringify(initParams),
})

const genBridgeConfig = (handle, caller_id, callee_id): T.BridgeConfig => ({
  caller_id, callee_id, handle
})

const genSignalConfig = ({ }) => ({
  trace: false,
  consistency: true,
})


const genNetworkConfig = (network) => async ({ configDir }) => {
  const dir = path.join(configDir, 'network-storage')
  await mkdirIdempotent(dir)
  const lib3hConfig = type => ({
    type,
    work_dir: '',
    log_level: 'd',
    bind_url: `http://0.0.0.0`,
    dht_custom_config: [],
    dht_timeout_threshold: 8000,
    dht_gossip_interval: 500,
    bootstrap_nodes: [],
    network_id: {
      nickname: 'app_spec',
      id: 'app_spec_memory',
    },
    transport_configs: [
      {
        type,
        data: type === 'memory' ? 'app-spec-memory' : 'Unencrypted',
      }
    ]
  })
  if (network === 'memory' || network === 'websocket') {
    return { network: lib3hConfig(network) }
  } else if (network === 'n3h') {
    return {
      network: {
        type: 'n3h',
        n3h_log_level: 'e',
        bootstrap_nodes: [],
        n3h_mode: 'REAL',
        n3h_persistence_path: dir,
      }
    }
  } else if (typeof network === 'object') {
    return { network }
  } else {
    throw new Error("Unsupported network type: " + network)
  }
}

export const genLoggerConfig = (logger) => {
  if (typeof logger === 'boolean') {
    return logger ? saneLoggerConfig : quietLoggerConfig
  } else {
    return { logger }
  }
}

export default {
  gen,
  dna: genDnaConfig,
  dpki: genDpkiConfig,
  bridge: genBridgeConfig,
  signals: genSignalConfig,
  network: genNetworkConfig,
  logger: genLoggerConfig,
}