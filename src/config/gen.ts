import * as T from "../types";
import * as _ from 'lodash'
import { trace, stringify } from "../util";
import env from '../env';
import logger from '../logger';
import { expand } from "./expand";

const exec = require('util').promisify(require('child_process').exec)
const path = require('path')

// NB: very important! Consistency signals drive the hachiko Waiter,
// which is the special sauce behind `await s.consistency()`
const defaultCommonConfig = {
  signals: {
    trace: false,
    consistency: true,
  }
}

/**
 * The main purpose of this module. It is a helper function which accepts an object
 * describing instances in shorthand, as well as a second object describing the additional
 * more general config fields. It is usually the case that the first object will be vary
 * between players, and the second field will be the same between different players.
 */
export const gen =
(instancesFort: T.Fort<T.EitherInstancesConfig>, commonFort?: T.Fort<T.ConductorConfigCommon>) => {
  // TODO: type check of `commonFort`

  // If we get a function, we can't type check until after the function has been called
  // ConfigSeedArgs
  let typeCheckLater = false

  // It leads to more helpful error messages
  // to have this validation before creating the seed function
  if (_.isFunction(instancesFort)) {
    typeCheckLater = true
  } else {
    validateInstancesType(instancesFort)
  }

  return async (args: T.ConfigSeedArgs): Promise<T.RawConductorConfig> =>
  {
    const instancesData = await T.collapseFort(instancesFort, args)
    if (typeCheckLater) {
      validateInstancesType(instancesData)
    }
    const instancesDry = _.isArray(instancesData)
      ? instancesData
      : desugarInstances(instancesData, args)

    const specific = await genPartialConfigFromDryInstances(instancesDry, args)
    const common = _.merge(
      {},
      defaultCommonConfig,
      await T.collapseFort(expand(commonFort), args)
    )

    return _.merge(
      {},
      specific,
      common,
    )
  }
}

const validateInstancesType = (instances: T.EitherInstancesConfig, msg: string = '') => {
  if (_.isArray(instances)) {
    T.decodeOrThrow(T.DryInstancesConfigV, instances, 'Could not validate Instances Array')
  } else if (_.isObject(instances)) {
    T.decodeOrThrow(T.SugaredInstancesConfigV, instances, 'Could not validate Instances Object')
  }
}


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
    dna.hash = await getDnaHash(dna.file).catch(err => {
      logger.warn(`Could not determine hash of DNA at '${dna.file}'. Note that tryorama cannot determine the hash of DNAs at URLs\n\tOriginal error: ${err}`)
      return "[UNKNOWN]"
    })
  }
  return dna
}

export const getConfigPath = configDir => path.join(configDir, 'conductor-config.toml')

export const desugarInstances = (instances: T.SugaredInstancesConfig, args: T.ConfigSeedArgs): T.DryInstancesConfig => {
  T.decodeOrThrow(T.SugaredInstancesConfigV, instances)
  // time to desugar the object
  return Object.entries(instances).map(([id, dna]) => ({
    id,
    agent: makeTestAgent(id, args),
    dna
  } as T.DryInstanceConfig))
}

export const makeTestAgent = (id, { playerName, uuid }) => ({
  // NB: very important that agents have different names on different conductors!!
  name: `${playerName}::${id}::${uuid}`,
  id: id,
  keystore_file: '[UNUSED]',
  public_address: '[SHOULD BE REWRITTEN]',
  test_agent: true,
})

export const genPartialConfigFromDryInstances = async (instances: T.DryInstancesConfig, args: T.ConfigSeedArgs) => {

  const { configDir, interfacePort, uuid } = args

  const config: any = {
    agents: [],
    dnas: [],
    instances: [],
    persistence_dir: configDir,
  }

  const interfaceConfig = {
    admin: true,
    choose_free_port: env.chooseFreePort,
    id: env.interfaceId,
    driver: {
      type: 'websocket',
      port: interfacePort,
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
      storage: instance.storage || {
        type: 'memory'
      }
    })
    interfaceConfig.instances.push({ id: instance.id })
  }

  config.interfaces = [interfaceConfig]
  return config
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
