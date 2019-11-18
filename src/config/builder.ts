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

const genNetworkConfig = (network: T.NetworkConfig) => async ({ configDir }): Promise<T.RawNetworkConfig> => {
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
    return lib3hConfig(network)
  } else if (network === 'n3h') {
    return {
      type: 'n3h',
      n3h_log_level: 'e',
      bootstrap_nodes: [],
      n3h_mode: 'REAL',
      n3h_persistence_path: dir,
    }
  } else if (typeof network === 'object') {
    return network
  } else {
    throw new Error("Unsupported network type: " + network)
  }
}

const genLoggerConfig = (logger) => {
  if (typeof logger === 'boolean') {
    return logger ? saneLoggerConfig : quietLoggerConfig
  } else {
    return logger
  }
}

const genMetricPublisherConfig = (mp: T.MetricPublisherConfig): T.RawMetricPublisherConfig => {

  if (mp == 'logger') {
    return {
      type: 'logger'
    }
  } else if (_.isObject(mp)) {
    return {
      type: 'cloudwatchlogs',
      log_group_name: mp.log_group_name,
      log_stream_name: mp.log_stream_name,
      region: mp.region
    }
  } else {
    throw new Error("Unsupported metric publisher type: " + mp)
  }
}

export default {
  gen,
  dna: genDnaConfig,
  dpki: genDpkiConfig,
  bridge: genBridgeConfig,
  network: genNetworkConfig,
  logger: genLoggerConfig,
  metricPublisher: genMetricPublisherConfig,
}
