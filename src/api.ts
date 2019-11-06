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
import { trycpSession, TrycpClient } from './trycp'

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
  _localPlayers: Record<string, Player>
  _trycpClients: Array<TrycpClient>
  _uuid: string
  _waiter: Waiter
  _modifiers: Modifiers
  _activityTimer: any

  constructor(description: string, orchestratorData, uuid: string, modifiers: Modifiers = { singleConductor: false }) {
    this.description = description
    this._localPlayers = {}
    this._trycpClients = []
    this._uuid = uuid
    this._globalConfig = orchestratorData._globalConfig
    this._waiter = new Waiter(FullSyncNetwork, undefined, orchestratorData.waiterConfig)
    this._modifiers = modifiers
    this._activityTimer = null
  }

  players = async (machines: T.MachineConfigs, spawnArgs?: any): Promise<T.ObjectS<Player>> => {
    logger.debug('api.players: creating players')
    const configsJson: Array<any> = []
    const playerBuilders: Record<string, Function> = {}
    for (const machineEndpoint in machines) {
      logger.debug('api.players: establishing trycp client connection to %s', machineEndpoint)
      const trycp: TrycpClient | null = (machineEndpoint === LOCAL_MACHINE_ID) ? null : await trycpSession(machineEndpoint)
      logger.debug('api.players: trycp client session established for %s', machineEndpoint)
      // choose our spwn method based on whether this is a local or remote machine
      const spawnConductor = trycp ? spawnRemote(trycp, stripPortFromUrl(machineEndpoint)) : spawnLocal
      const configs = machines[machineEndpoint]

      if (trycp) {
        // keep track of it so we can send a reset() at the end of this scenario
        this._trycpClients.push(trycp)
      }
      // // if passing an array, convert to an object with keys as stringified indices. Otherwise just get the key, value pairs
      // const entries: Array<[string, AnyConfigBuilder]> = _.isArray(configs)
      //   ? configs.map((v, i) => [String(i), v])
      //   : Object.entries(configs)

      for (const playerName in configs) {
        const configSeed = standardizeConfigSeed(configs[playerName], this._globalConfig)
        const configSeedArgs = trycp
          ? _.assign(await trycp.setup(playerName), { playerName, uuid: this._uuid })
          : await localConfigSeedArgs(playerName, this._uuid)
        logger.debug('api.players: seed args generated for %s', playerName)
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
          logger.debug('api.players: player config committed for %s', playerName)

          const player = new Player({
            name: playerName,
            configSeedArgs,
            spawnConductor,
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
            logger.debug('api.players: auto-spawning player %s', playerName)
            await player.spawn(spawnArgs)
            logger.debug('api.players: spawn complete for %s', playerName)
          }

          return player
        }
      }
    }

    // this will throw an error if something is wrong
    assertUniqueTestAgentNames(configsJson)
    logger.debug('api.players: unique agent name check passed')
    const players = await promiseSerialObject<Player>(_.mapValues(playerBuilders, c => c()))
    logger.debug('api.players: players built')
    this._localPlayers = players
    return players
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
    this._activityTimer = setTimeout(() => this._destroyLocalConductors(), env.conductorTimeoutMs)
  }

  _destroyLocalConductors = async () => {
    const kills = await this._cleanup('SIGKILL')
    this._clearTimer()
    const names = _.values(this._localPlayers).filter((player, i) => kills[i]).map(player => player.name)
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
    const localKills = await Promise.all(
      _.values(this._localPlayers).map(player => player.cleanup(signal))
    )
    await Promise.all(this._trycpClients.map(async (trycp) => await trycp.reset()))
    this._clearTimer()
    return localKills
  }

}
