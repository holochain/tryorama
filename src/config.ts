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

const tempDir = async () => {
  const base = path.join(process.env.TRYORAMA_STORAGE || os.tmpdir(), 'try-o-rama/')
  await mkdirIdempotent(base)
  const dir = await fs.mkdtemp(base)
  return dir
}

const dnaDir = async () => {
  const dir = path.join(await tempDir(), 'dnas-fetched')
  await mkdirIdempotent(dir)
  return dir
}

export const dna = (location, id?, opts = {}): T.DnaConfig => {
  if (!id) {
    id = dnaPathToId(location)
  }
  return { path: location, id, ...opts }
}

/**
 * If a dna config object contains a URL in the path, 
 * download the file to a temp directory, 
 * and rewrite the path to point to downloaded file
 */
export const resolveDna = async (dna: T.DnaConfig) => {
  if (dna.path.match(/^https?:/)) {
    const dnaPath = path.join(await dnaDir(), dna.id + '.dna.json')
    await downloadFile({ url: dna.path, path: dnaPath })
    return Object.assign({}, dna, { path: dnaPath })
  } else {
    return dna
  }
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

export const defaultSpawnConductor = async (name, configPath) => {
  const binPath = process.env.TRYORAMA_HOLOCHAIN_PATH || 'holochain'
  const handle = spawn(binPath, ['-c', configPath])

  handle.stdout.on('data', data => logger.info(`[C '${name}'] %s`, data.toString('utf8')))
  handle.stderr.on('data', data => logger.error(`!C '${name}'! %s`, data.toString('utf8')))
  handle.on('close', code => logger.info(`conductor '${name}' exited with code ${code}`))

  return handle
}


/**
 * Helper function to generate TOML config from a simpler object.
 */
export const genConfig = (inputConfig: T.ConductorConfig | T.SugaredConductorConfig): T.GenConfigFn => {
  const config = desugarConfig(inputConfig)

  return async (args: T.GenConfigArgs) => {
    const pieces = [
      await genInstanceConfig(config, args),
      genBridgeConfig(config),
      genDpkiConfig(config),
      genSignalConfig(config),
      genNetworkConfig(config),
      genLoggingConfig(false),
    ]
    console.log(pieces)
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
      agent: { id, name: id },
      dna
    } as T.InstanceConfig))
  }
  return config as T.ConductorConfig
}

export const genInstanceConfig = async ({ instances }, { configDir, adminPort, zomePort }) => {

  const config: any = {
    agents: [],
    dnas: [],
    instances: [],
  }

  const adminInterface = {
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
    }
    if (!dnaIds.has(instance.dna.id)) {
      instance.dna = await resolveDna(instance.dna)
      if (!instance.dna.hash) {
        instance.dna.hash = await getDnaHash(instance.dna.path).catch(err => {
          throw new Error(`Could not determine hash of DNA file '${instance.dna.path}'. Does the file exist?\n\tOriginal error: ${err}`)
        })
      }
      config.dnas.push(instance.dna)
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

export const genNetworkConfig = ({ }: T.ConductorConfig) => ({})

export const genLoggingConfig = (debug) => {
  return {
    logger: {
      type: 'debug',
      state_dump: false,
      rules: {
        rules: [{ exclude: !debug, pattern: "^debug" }]
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