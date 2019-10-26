import * as _ from 'lodash'
const fs = require('fs').promises
const path = require('path')
const TOML = require('@iarna/toml')

import { Waiter, FullSyncNetwork } from '@holochain/hachiko'
import * as T from "./types"
import { Player } from "./player"
import logger from './logger';
import { Orchestrator } from './orchestrator';
import { promiseSerialObject, delay, stripPortFromUrl, trace } from './util';
import { getConfigPath, genConfig, assertUniqueTestAgentNames, localConfigSeedArgs, spawnRemote, spawnLocal } from './config';
import env from './env'
import { trycpSession, TrycpSession } from './trycp'

type Modifiers = {
  singleConductor: boolean
}

const LOCAL_MACHINE_ID = 'local'

const standardizeConfigSeed = (configData: T.AnyConfigBuilder, globalConfig: T.GlobalConfig): T.ConfigSeed => {
  return _.isFunction(configData)
    ? (configData as T.ConfigSeed)
    : genConfig(configData as T.EitherConductorConfig, globalConfig)
}

export class ScenarioApi {

  description: string

  _globalConfig: T.GlobalConfig
  _players: Record<string, Player>
  _uuid: string
  _waiter: Waiter
  _modifiers: Modifiers
  _activityTimer: any

  constructor(description: string, orchestratorData, uuid: string, modifiers: Modifiers = { singleConductor: false }) {
    this.description = description
    this._players = {}
    this._uuid = uuid
    this._globalConfig = orchestratorData._globalConfig
    this._waiter = new Waiter(FullSyncNetwork, undefined, orchestratorData.waiterConfig)
    this._modifiers = modifiers
    this._activityTimer = null
  }

  players = async (machines: T.MachineConfigs, spawnArgs?: any): Promise<T.ObjectS<Player>> => {
    logger.debug('creating players')
    const configsJson: Array<any> = []
    const playerBuilders: Record<string, Function> = {}
    for (const machineEndpoint in machines) {
      const configs = machines[machineEndpoint]
      const machineUrl = stripPortFromUrl(machineEndpoint)

      // // if passing an array, convert to an object with keys as stringified indices. Otherwise just get the key, value pairs
      // const entries: Array<[string, AnyConfigBuilder]> = _.isArray(configs)
      //   ? configs.map((v, i) => [String(i), v])
      //   : Object.entries(configs)

      const trycp: TrycpSession | null = (machineEndpoint === LOCAL_MACHINE_ID) ? null : await trycpSession(machineEndpoint)

      for (const playerName in configs) {
        const configSeed = standardizeConfigSeed(configs[playerName], this._globalConfig)
        const configSeedArgs = trycp
          ? _.assign(await trycp.getArgs(), { playerName, uuid: this._uuid })
          : await localConfigSeedArgs(playerName, this._uuid)
        const configToml = await configSeed(configSeedArgs)
        const configJson = TOML.parse(configToml)
        configsJson.push(configJson)

        // this code will only be executed once it is determined that all configs are valid
        playerBuilders[playerName] = async () => {
          const { instances } = configJson
          const { configDir } = configSeedArgs
          if (trycp) {
            await trycp.player(playerName, configToml)
          } else {
            await fs.writeFile(getConfigPath(configDir), configToml)
          }

          const player = new Player({
            name: playerName,
            configSeedArgs,
            spawnConductor: trycp ? spawnRemote(trycp, machineUrl) : spawnLocal,
            onJoin: () => instances.forEach(instance => this._waiter.addNode(instance.dna, playerName)),
            onLeave: () => instances.forEach(instance => this._waiter.removeNode(instance.dna, playerName)),
            onActivity: () => this._restartTimer(),
            onSignal: ({ instanceId, signal }) => {
              const instance = instances.find(c => c.id === instanceId)
              const dnaId = instance!.dna
              const observation = {
                dna: dnaId,
                node: playerName,
                signal
              }
              this._waiter.handleObservation(observation)
            },
          })

          if (spawnArgs) {
            await player.spawn(spawnArgs)
          }

          return player
        }
      }
    }

    // this will throw an error if something is wrong
    assertUniqueTestAgentNames(configsJson)

    const players = await promiseSerialObject<Player>(_.mapValues(playerBuilders, c => c()))
    this._players = players
    return players

    // const configsIntermediate = await Promise.all(entries.map(async ([name, config]) => {
    //   const genConfigArgs = await makeGenConfigArgs(name, this._uuid)
    //   // If an object was passed in, run it through genConfig first. Otherwise use the given function.
    //   const configBuilder = _.isFunction(config)
    //     ? (config as T.ConfigSeed)
    //     : genConfig(config as T.EitherConductorConfig, this._globalConfig)
    //   const configToml = await configBuilder(genConfigArgs)
    //   return { name, configJson, configToml, genConfigArgs }
    // }))

    // logger.debug('deduping agent ids')
    // assertUniqueTestAgentNames(configsIntermediate.map(c => c.configJson))

    // configsIntermediate.forEach(({ name, configJson, configToml }) => {
    //   players[name] = (async () => {
    //     const { instances } = configJson

    //       (trycp) ?  : fs.writeFile(getConfigPath(configDir), configToml)
    //     await commitConfig(configToml)


    //     return player
    //   })()
    // })
    // const ps = await promiseSerialObject<Player>(players)
    // return ps
  }

  consistency = (players?: Array<Player>): Promise<void> => new Promise((resolve, reject) => {
    if (players) {
      throw new Error("Calling `consistency` with parameters is currently unsupported. See https://github.com/holochain/hachiko/issues/10")
    }
    this._waiter.registerCallback({
      // nodes: players ? players.map(p => p.name) : null,
      nodes: null,
      resolve,
      reject,
    })
  })

  globalConfig = (): T.GlobalConfig => this._globalConfig

  _clearTimer = () => {
    logger.debug('cleared timer')
    clearTimeout(this._activityTimer)
    this._activityTimer = null
  }

  _restartTimer = () => {
    logger.debug('restarted timer')
    clearTimeout(this._activityTimer)
    this._activityTimer = setTimeout(() => this._destroyConductors(), env.conductorTimeoutMs)
  }

  _destroyConductors = async () => {
    const kills = await this._cleanup('SIGKILL')
    this._clearTimer()
    const names = _.values(this._players).filter((player, i) => kills[i]).map(player => player.name)
    names.sort()
    const msg = `
The following conductors were forcefully shutdown after ${env.conductorTimeoutMs / 1000} seconds of no activity:
${names.join(', ')}
`
    if (env.strictConductorTimeout) {
      throw new Error(msg)
    } else {
      logger.error(msg)
    }
  }


  /**
   * Only called externally when there is a test failure, 
   * to ensure that players/conductors have been properly cleaned up
   */
  _cleanup = async (signal?): Promise<Array<boolean>> => {
    const kills = await Promise.all(
      _.values(this._players).map(player => player.cleanup(signal))
    )
    this._clearTimer()
    return kills
  }

}
