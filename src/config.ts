import * as T from "./types";
import { downloadFile } from "./util";
import { spawn } from "child_process";
import logger from "./logger";
const TOML = require('@iarna/toml')
const _ = require('lodash')

const exec = require('util').promisify(require('child_process').exec)
const fs = require('fs').promises
const os = require('os')
const path = require('path')
const getPort = require('get-port')


const mkdirIdempotent = dir => fs.access(dir).catch(() => {
  fs.mkdir(dir, { recursive: true })
})

const tempDirBase = () => path.join(process.env.TRYORAMA_STORAGE || os.tmpdir(), 'try-o-rama/')

const tempDir = async () => {
  if (!tempDir._cached) {
    const base = tempDirBase()
    await mkdirIdempotent(base)
    tempDir._cached = await fs.mkdtemp(base)
  }
  return tempDir._cached
}

tempDir._cached = null

/**
 * Directory to store downloaded DNAs in.
 * **NOTE**: this is currently shared among all runs over all time, for better caching.
 * TODO: change this to `tempDir` instead of `tempDirBase` to remove this overzealous caching!
 */
const dnaDir = async () => {
  const dir = path.join(tempDirBase(), 'dnas-fetched')
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
export const resolveDna = async (inputDna: T.DnaConfig, uuid: string): Promise<T.DnaConfig> => {
  const dna = _.cloneDeep(inputDna)
  if (!dna.file) {
    throw new Error(`Invalid 'file' for dna: ${JSON.stringify(dna)}`)
  }
  if (dna.file.match(/^https?:/)) {
    const dnaPath = path.join(await dnaDir(), dna.id + '.dna.json')
    await downloadFile({ url: dna.file, path: dnaPath, overwrite: false })
    dna.file = dnaPath
  }
  if (!dna.hash) {
    dna.hash = await getDnaHash(dna.file).catch(err => {
      throw new Error(`Could not determine hash of DNA file '${dna.file}'. Does the file exist?\n\tOriginal error: ${err}`)
    })
  }
  dna.uuid = dna.uuid ? `${dna.uuid}::${uuid}` : uuid
  return dna
}

export const dnaPathToId = (dnaPath) => {
  const matches = dnaPath.match(/([^/]+)$/g)
  return matches[0].replace(/\.dna\.json$/, '')
}

export const bridge = (handle, caller_id, callee_id) => ({ handle, caller_id, callee_id })

export const dpki = (instance_id, init_params?): T.DpkiConfig => ({
  instance_id,
  init_params: JSON.stringify(init_params ? init_params : {})
})

export const getConfigPath = configDir => path.join(configDir, 'conductor-config.toml')

/**
 * Function to generate the default args for genConfig functions.
 * This can be overridden as part of Orchestrator config.
 * NB: Since we are using ports, there is a small chance of a race condition
 * when multiple conductors are attempting to secure ports for their interfaces.
 * In the future it would be great to move to domain socket based interfaces.
 */
export const defaultGenConfigArgs = async () => {
  const adminPort = await getPort()
  const configDir = await tempDir()
  let zomePort = adminPort
  while (zomePort == adminPort) {
    zomePort = await getPort()
  }
  return { configDir, adminPort, zomePort }
}

export const defaultSpawnConductor = (name, configPath): Promise<T.Mortal> => {
  const binPath = process.env.TRYORAMA_HOLOCHAIN_PATH || 'holochain'
  const handle = spawn(binPath, ['-c', configPath])

  handle.stdout.on('data', data => logger.info(`[C '${name}'] %s`, data.toString('utf8')))
  handle.stderr.on('data', data => logger.error(`!C '${name}'! %s`, data.toString('utf8')))
  handle.on('close', code => logger.info(`conductor '${name}' exited with code ${code}`))

  return new Promise((resolve) => {
    handle.stdout.on('data', data => {
      // wait for the logs to convey that the interfaces have started
      // because the consumer of this function needs those interfaces
      // to be started so that it can initiate, and form,
      // the websocket connections
      if (data.toString('utf8').indexOf('Starting interfaces...') >= 0) {
        console.info(`Conductor '${name}' process spawning successful`)
        resolve(handle)
      }
    })
  })
}


/**
 * Helper function to generate TOML config from a simpler object.
 */
export const genConfig = (inputConfig: T.EitherConductorConfig): T.GenConfigFn => {
  const config = desugarConfig(inputConfig)

  return async (args: T.GenConfigArgs, uuid: string) => {
    const pieces = [
      await genInstanceConfig(config, args, uuid),
      await genBridgeConfig(config),
      await genDpkiConfig(config),
      await genSignalConfig(config),
      await genNetworkConfig(config, args),
      await genLoggingConfig(false),
    ]
    const json = Object.assign({},
      ...pieces
    )
    return TOML.stringify(json)
  }
}

export const desugarConfig = (config: T.ConductorConfig | T.SugaredConductorConfig): T.ConductorConfig => {
  if (_.isObject(config.instances)) {
    const { instances } = config
    config.instances = Object.entries(instances).map(([id, dna]) => ({
      id,
      agent: agentFromName(id),
      dna
    } as T.InstanceConfig))
  }
  return config as T.ConductorConfig
}

const agentFromName = name => ({
  name,
  id: name,
  keystore_file: name,
  public_address: name,
  test_agent: true,
})

export const genInstanceConfig = async ({ instances }, { configDir, adminPort, zomePort }, uuid) => {

  const config: any = {
    agents: [],
    dnas: [],
    instances: [],
    persistence_dir: configDir,
  }

  const adminInterface = {
    admin: true,
    id: 'try-o-rama-admin-interface',
    driver: {
      type: 'websocket',
      port: adminPort,
    },
    instances: []
  }

  const zomeInterface = {
    id: 'try-o-rama-zome-interface',
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
    if (!dnaIds.has(instance.dna.id)) {
      instance.dna = await resolveDna(instance.dna, uuid)
      config.dnas.push(instance.dna)
      dnaIds.add(instance.dna.id)
    }
    config.instances.push({
      id: instance.id,
      agent: instance.agent.id,
      dna: instance.dna.id,
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

export const genDpkiConfig = ({ dpki }: T.ConductorConfig) => (dpki ? { dpki } : {})

export const genSignalConfig = ({ }) => ({
  signals: {
    trace: false,
    consistency: true,
  }
})

export const genNetworkConfig = async ({ }: T.ConductorConfig, { configDir }) => {
  const dir = path.join(configDir, 'n3h-storage')
  await mkdirIdempotent(dir)
  return {
    network: {
      type: 'n3h',
      n3h_log_level: 'i',
      bootstrap_nodes: [],
      n3h_mode: 'REAL',
      n3h_persistence_path: dir,
    }
  }
}

export const genLoggingConfig = (debug) => {
  return {
    logger: {
      type: 'debug',
      state_dump: debug,
      rules: {
        rules: [{ exclude: !debug, pattern: ".*" }]
        // rules: [{ exclude: !debug, pattern: "^debug" }]
      }
    }
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