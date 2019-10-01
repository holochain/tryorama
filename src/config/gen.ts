import * as T from "../types";
import { downloadFile, trace } from "../util";
import logger from '../logger';
const TOML = require('@iarna/toml')
const _ = require('lodash')

const exec = require('util').promisify(require('child_process').exec)
const fs = require('fs').promises
const os = require('os')
const path = require('path')
const getPort = require('get-port')

export const ADMIN_INTERFACE_ID = 'try-o-rama-admin-interface'
export const ZOME_INTERFACE_ID = 'try-o-rama-zome-interface'

const mkdirIdempotent = dir => fs.access(dir).catch(() => {
  fs.mkdir(dir, { recursive: true })
})

const tempDirBase = path.join(process.env.TRYORAMA_STORAGE || os.tmpdir(), 'try-o-rama/')
const tempDir = async () => {
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
  return { file: location, id, ...opts }
}

/**
 * 1. If a dna config object contains a URL in the path, download the file to a temp directory, 
 *     and rewrite the path to point to downloaded file.
 * 2. Then, if the hash is not set, calculate the hash and set it.
 * 3. Add the UUID for this scenario
 */
export const resolveDna = async (inputDna: T.DnaConfig, providedUuid: string): Promise<T.DnaConfig> => {
  const dna = _.cloneDeep(inputDna)
  if (!dna.file) {
    throw new Error(`Invalid 'file' for dna: ${JSON.stringify(dna)}`)
  }
  if (dna.file.match(/^https?:/)) {
    const dnaPath = path.join(await dnaDir(), dna.id + '.dna.json')
    await downloadFile({ url: dna.file, path: dnaPath, overwrite: false })
    dna.file = dnaPath
  }

  dna.id = dna.uuid ? `${dna.id}::${dna.uuid}` : dna.id
  dna.uuid = dna.uuid ? `${dna.uuid}::${providedUuid}` : providedUuid

  if (!dna.hash) {
    dna.hash = await getDnaHash(dna.file).catch(err => {
      throw new Error(`Could not determine hash of DNA file '${dna.file}'. Does the file exist?\n\tOriginal error: ${err}`)
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
 * Function to generate the default args for genConfig functions.
 * This can be overridden as part of Orchestrator config.
 * NB: Since we are using ports, there is a small chance of a race condition
 * when multiple conductors are attempting to secure ports for their interfaces.
 * In the future it would be great to move to domain socket based interfaces.
 */
export const defaultGenConfigArgs = async (conductorName: string, uuid: string) => {
  const adminPort = await getPort()
  const configDir = await tempDir()
  let zomePort = adminPort
  while (zomePort == adminPort) {
    zomePort = await getPort()
  }
  return { conductorName, configDir, adminPort, zomePort, uuid }
}


/**
 * Helper function to generate, from a simple object, a function that returns valid TOML config.
 * 
 * TODO: move debugLog into ConductorConfig
 */
export const genConfig = (inputConfig: T.AnyConductorConfig, g: T.GlobalConfig): T.GenConfigFn => {
  if (typeof inputConfig === 'function') {
    // let an already-generated function just pass through
    return inputConfig
  }

  T.decodeOrThrow(T.EitherConductorConfigV, inputConfig)

  return async (args: T.GenConfigArgs) => {
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

export const desugarConfig = (args: T.GenConfigArgs, config: T.EitherConductorConfig): T.ConductorConfig => {
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

export const makeTestAgent = (id, { conductorName, uuid }: T.GenConfigArgs) => ({
  // NB: very important that agents have different names on different conductors!!
  name: `${conductorName}::${id}::${uuid}`,
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
    id: ADMIN_INTERFACE_ID,
    driver: {
      type: 'websocket',
      port: adminPort,
    },
    instances: []
  }

  const zomeInterface = {
    id: ZOME_INTERFACE_ID,
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
        type: 'file',
        path: path.join(configDir, instance.id)
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
    return {
      logger: {
        type: 'debug',
        state_dump: false,
        rules: {
          rules: [{ exclude: !logger, pattern: ".*" }]
        }
      }
    }
  } else {
    return { logger }
  }
}

export const getDnaHash = async (dnaPath) => {
  const { stdout, stderr } = await exec(`hc hash -p ${dnaPath}`)
  if (stderr) {
    throw new Error("Error while getting hash: " + stderr)
  }
  const [hash] = stdout.match(/\w{46}/)
  if (!hash) {
    throw new Error("Could not parse hash from `hc hash` output, which follows: " + stdout)
  }
  return hash
}

export const assertUniqueTestAgentNames = (configs: Array<T.InstanceConfig>) => {
  const agentNames = _.chain(configs).values().map(n => n.agents.filter(a => a.test_agent).map(a => a.name)).flatten().value()
  const frequencies = _.countBy(agentNames) as { [k: string]: number }
  const dupes = Object.entries(frequencies).filter(([k, v]) => v > 1)
  if (dupes.length > 0) {
    const display = dupes.reduce((s, [name, freq]) => `${s}\n(x${freq}): ${name}`, "")
    const msg = `There are ${dupes.length} non-unique test agent names specified across all conductor configs: ${display}`
    logger.debug(msg)
    throw new Error(msg)
  }
}