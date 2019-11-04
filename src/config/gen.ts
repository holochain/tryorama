import * as T from "../types";
import * as _ from 'lodash'
import { downloadFile, trace } from "../util";
import { Mutex } from 'async-mutex'
import env from '../env';
import logger from '../logger';
import { saneLoggerConfig, quietLoggerConfig } from './logger';
const TOML = require('@iarna/toml')

const exec = require('util').promisify(require('child_process').exec)
const fs = require('fs').promises
const os = require('os')
const path = require('path')

const mkdirIdempotent = dir => fs.access(dir).catch(() => {
  fs.mkdir(dir, { recursive: true })
})

const tempDirBase = path.join(env.tempStorage || os.tmpdir(), 'tryorama/')
mkdirIdempotent(tempDirBase)

export const tempDir = async () => {
  await mkdirIdempotent(tempDirBase)
  return fs.mkdtemp(tempDirBase)
}

/**
 * Directory to store downloaded DNAs in.
 * **NOTE**: this is currently shared among all runs over all time, for better caching.
 * TODO: change this to `tempDir` instead of `tempDirBase` to remove this overzealous caching!
 */
const dnaDir = async () => {
  const dir = path.join(tempDirBase, 'dnas-fetched')
  await mkdirIdempotent(dir)
  return dir
}

export const dna = (location, id?, opts = {}): T.DnaConfig => {
  if (!id) {
    id = dnaPathToId(location)
  }
  return { location, id, ...opts }
}

const downloadMutex = new Mutex()

/**
 * 1. If a dna config object contains a URL in the path, download the file to a temp directory, 
 *     and rewrite the path to point to downloaded file.
 * 2. Then, if the hash is not set, calculate the hash and set it.
 * 3. Add the UUID for this scenario
 */
export const resolveDna = async (inputDna: T.DnaConfig, providedUuid: string): Promise<T.DnaConfig> => {
  const dna = _.cloneDeep(inputDna)

  dna.id = dna.uuid ? `${dna.id}::${dna.uuid}` : dna.id
  dna.uuid = dna.uuid ? `${dna.uuid}::${providedUuid}` : providedUuid

  if (!dna.hash) {
    dna.hash = await getDnaHash(dna.location).catch(err => {
      logger.warn(`Could not determine hash of DNA at '${dna.location}'. Note that tryorama cannot determine the hash of DNAs at URLs\n\tOriginal error: ${err}`)
    })
  }
  return dna
}

export const dnaPathToId = (dnaPath) => {
  const matches = dnaPath.match(/([^/]+)$/g)
  return matches[0].replace(/\.dna\.json$/, '')
}

export const bridge = (handle, caller_id, callee_id) => ({ handle, caller_id, callee_id })

export const dpki = (instance_id, init_params?): T.DpkiConfig => ({
  instance_id,
  init_params: init_params ? init_params : {}
})

export const getConfigPath = configDir => path.join(configDir, 'conductor-config.toml')


/**
 * Helper function to generate, from a simple object, a function that returns valid TOML config.
 * 
 * TODO: move debugLog into ConductorConfig
 */
export const genConfig = (inputConfig: T.AnyConductorConfig, g: T.GlobalConfig): T.ConfigSeed => {
  if (typeof inputConfig === 'function') {
    // let an already-generated function just pass through
    return inputConfig
  }

  T.decodeOrThrow(T.EitherConductorConfigV, inputConfig)

  return async (args: T.ConfigSeedArgs) => {
    const config = desugarConfig(args, inputConfig)
    const pieces = [
      await genInstanceConfig(config, args),
      await genBridgeConfig(config),
      await genDpkiConfig(config),
      await genSignalConfig(config),
      await genNetworkConfig(config, args, g),
      await genLoggerConfig(config, args, g),
    ]
    const json = Object.assign({},
      ...pieces
    )
    const toml = TOML.stringify(json) + "\n"
    return toml
  }
}

export const desugarConfig = (args: { playerName: string, uuid: string }, config: T.EitherConductorConfig): T.ConductorConfig => {
  config = _.cloneDeep(config)
  if (!_.isArray(config.instances)) {
    // time to desugar the object
    const { instances } = config
    config.instances = Object.entries(instances).map(([id, dna]) => ({
      id,
      agent: makeTestAgent(id, args),
      dna
    } as T.InstanceConfig))
  }
  return config as T.ConductorConfig
}

export const makeTestAgent = (id, { playerName, uuid }) => ({
  // NB: very important that agents have different names on different conductors!!
  name: `${playerName}::${id}::${uuid}`,
  id: id,
  keystore_file: '[UNUSED]',
  public_address: '[SHOULD BE REWRITTEN]',
  test_agent: true,
})

export const genInstanceConfig = async ({ instances }, { configDir, adminPort, zomePort, uuid }) => {

  const config: any = {
    agents: [],
    dnas: [],
    instances: [],
    persistence_dir: configDir,
  }

  const adminInterface = {
    admin: true,
    id: env.adminInterfaceId,
    driver: {
      type: 'websocket',
      port: adminPort,
    },
    instances: []
  }

  const zomeInterface = {
    id: env.zomeInterfaceId,
    driver: {
      type: 'websocket',
      port: zomePort,
    },
    instances: [] as Array<{ id: string }>
  }

  const agentIds = new Set()
  const dnaIds = new Set()

  for (const instance of instances) {
    if (!agentIds.has(instance.agent.id)) {
      config.agents.push(instance.agent)
      agentIds.add(instance.agent.id)
    }
    const resolvedDna = await resolveDna(instance.dna, uuid)
    if (!dnaIds.has(resolvedDna.id)) {
      config.dnas.push(resolvedDna)
      dnaIds.add(resolvedDna.id)
    }
    config.instances.push({
      id: instance.id,
      agent: instance.agent.id,
      dna: resolvedDna.id,
      storage: {
        type: 'memory'
      }
    })
    zomeInterface.instances.push({ id: instance.id })
  }

  config.interfaces = [adminInterface, zomeInterface]
  return config
}

export const genBridgeConfig = ({ bridges }: T.ConductorConfig) => (bridges ? { bridges } : {})

export const genDpkiConfig = ({ dpki }: T.ConductorConfig) => {
  if (dpki && _.isObject(dpki)) {
    return {
      dpki: {
        instance_id: dpki.instance_id,
        init_params: JSON.stringify(dpki.init_params)
      }
    }
  } else {
    return {}
  }
}

export const genSignalConfig = ({ }) => ({
  signals: {
    trace: false,
    consistency: true,
  }
})

export const genNetworkConfig = async (c: T.ConductorConfig, { configDir }, g: T.GlobalConfig) => {
  const dir = path.join(configDir, 'network-storage')
  await mkdirIdempotent(dir)
  const network = c.network || g.network
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

export const genLoggerConfig = (c: T.ConductorConfig, { }, g: T.GlobalConfig) => {
  const logger = c.logger || g.logger || false
  if (typeof logger === 'boolean') {
    return logger ? saneLoggerConfig : quietLoggerConfig
  } else {
    return { logger }
  }
}

export const getDnaHash = async (dnaPath) => {
  const { stdout, stderr } = await exec(`hc hash -p ${dnaPath}`)
  if (!stdout) {
    throw new Error("Error while getting hash: " + stderr)
  }
  const [hash] = stdout.match(/\w{46}/)
  if (!hash) {
    let msg = "Could not parse hash from `hc hash` output, which follows: " + stdout
    if (stderr) {
      msg += "`hc hash` also produced error output: " + stderr
    }
    throw new Error(msg)
  }
  return hash
}

export const assertUniqueTestAgentNames = (configs: Array<T.RawConductorConfig>) => {
  const agentNames = _.chain(configs).map(n => n.agents.filter(a => a.test_agent).map(a => a.name)).flatten().value()
  const frequencies = _.countBy(agentNames) as { [k: string]: number }
  const dupes = Object.entries(frequencies).filter(([k, v]) => v > 1)
  if (dupes.length > 0) {
    const display = dupes.reduce((s, [name, freq]) => `${s}\n(x${freq}): ${name}`, "")
    const msg = `There are ${dupes.length} non-unique test agent names specified across all conductor configs: ${display}`
    logger.debug(msg)
    throw new Error(msg)
  }
}
