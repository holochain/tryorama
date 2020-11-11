import * as _ from 'lodash'
const fs = require('fs').promises
const path = require('path')
const YAML = require('yaml')

import { Waiter, FullSyncNetwork } from '@holochain/hachiko'
import * as T from "./types"
import { Player } from "./player"
import logger from './logger';
import { Orchestrator } from './orchestrator';
import { promiseSerialObject, stringify, stripPortFromUrl, trace } from './util';
import { getConfigPath, /*assertUniqueTestAgentNames,*/ localConfigSeedArgs, spawnRemote, spawnLocal } from './config';
import env from './env'
import { trycpSession, TrycpClient } from './trycp'

type Modifiers = {
  singleConductor: boolean
}

const LOCAL_MACHINE_ID = 'local'

type PlayerBuilder = () => Promise<Player>

export class ScenarioApi {

  description: string
  fail: Function

  _localPlayers: Record<string, Player>
  _trycpClients: Array<TrycpClient>
  _uuid: string
  _waiter: Waiter
  _modifiers: Modifiers
  _activityTimer: any

  constructor(description: string, orchestratorData, uuid: string, modifiers: Modifiers = { singleConductor: false }) {
    this.description = description
    this.fail = (reason) => { throw new Error(`s.fail: ${reason}`) }

    this._localPlayers = {}
    this._trycpClients = []
    this._uuid = uuid
    this._waiter = new Waiter(FullSyncNetwork, undefined, orchestratorData.waiterConfig)
    this._modifiers = modifiers
    this._activityTimer = null
  }

  players = async (machines: T.MachineConfigs, spawnArgs?: T.Initialization | boolean): Promise<T.ObjectS<Player>> => {
    logger.debug('api.players: creating players')
    // const configsJson: Array<T.RawConductorConfig> = []
    const playerBuilders: Record<string, PlayerBuilder> = {}
    for (const machineEndpoint in machines) {
      const trycp = machineEndpoint === LOCAL_MACHINE_ID
      const playerConfigs = machines[machineEndpoint]
      for (const playerName in playerConfigs) {
        const playerConfigSeed: T.ConfigSeed = playerConfigs[playerName]
        if (!_.isFunction(playerConfigSeed)) {
          throw new Error(`Config for player '${playerName}' contains something other than a function. Either use Config.gen to create a seed function, or supply one manually.`)
        }
        playerBuilders[playerName] = trycp
          // local machine
          ? (await this._createLocalPlayerBuilder(machineEndpoint, playerName, playerConfigSeed))
          // trycp
          : (await this._createTrycpPlayerBuilder(machineEndpoint, playerName, playerConfigSeed))
      }
    }

    // this will throw an error if something is wrong
    // assertUniqueTestAgentNames(configsJson)
    // logger.debug('api.players: unique agent name check passed')

    const players = await promiseSerialObject<Player>(_.mapValues(playerBuilders, c => c()))
    logger.debug('api.players: players built')

    // since this function can be called multiple times, make sure
    // to keep any existing _localPlayers while adding the new ones
    this._localPlayers = { ...this._localPlayers, ...players }

    // if no spawnArgs provided default is to spawn
    const autoSpawn: boolean = (spawnArgs === undefined) || ((typeof spawnArgs === "boolean") && spawnArgs) || (typeof spawnArgs === "object")

    // Do auto-spawning.  The spawn args can be a bool or an object which will be passed
    // into the conductor spawn function for any special spawning instructions, which
    // is not the same thing as app initialization which must be done separately.
    if (autoSpawn) {
      for (const player of Object.values(players)) {
        logger.info('api.players: auto-spawning player %s', player.name)
        await player.spawn({}) //FIXME actual spawn args for conductor spawning (not initialization)
        logger.info('api.players: spawn complete for %s', player.name)
        if (spawnArgs && (typeof spawnArgs === "object")) {
          await player.initializeApps(spawnArgs!)
          logger.info('api.players: initializedApps for %s', player.name)
        }
      }
    }

    return players
  }

  // FIXME!!!  probably need to rip out hachiko
  consistency = (players?: Array<Player>): Promise<number> => new Promise((resolve, reject) => {
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

  _createTrycpPlayerBuilder = async (machineEndpoint: string, playerName: string, configSeed: T.ConfigSeed): Promise<PlayerBuilder> => {
    const trycpClient: TrycpClient = await this._getTrycpClient(machineEndpoint)
    // keep track of it so we can send a reset() at the end of this scenario
    this._trycpClients.push(trycpClient)
    const partialConfigSeedArgs = await trycpClient.setup(playerName)
    const configJson = this._generateConfigFromSeed(partialConfigSeedArgs, playerName, configSeed)
    return async () => {
      const configDir = configJson.environment_path
      // FIXME: can we get this from somewhere?
      const adminInterfacePort = 0
      const newConfigJson = await interpolateConfigDnaUrls(trycpClient, configJson)
      await trycpClient.player(playerName, newConfigJson)
      logger.debug('api.players: player config committed for %s', playerName)
      return new Player({
        name: playerName,
        config: configJson,
        configDir,
        adminInterfacePort,
        spawnConductor: spawnRemote(trycpClient, stripPortFromUrl(machineEndpoint)),
        onJoin: () => console.log("FIXME: ignoring onJoin"),//instances.forEach(instance => this._waiter.addNode(instance.dna, playerName)),
        onLeave: () => console.log("FIXME: ignoring onLeave"),//instances.forEach(instance => this._waiter.removeNode(instance.dna, playerName)),
        onActivity: () => this._restartTimer(),
        onSignal: (signal_data) => {},
      })
    }
  }

  _createLocalPlayerBuilder = async (machineEndpoint: string, playerName: string, configSeed: T.ConfigSeed): Promise<PlayerBuilder> => {
    return async () => {
      const partialConfigSeedArgs = await localConfigSeedArgs()
      const configJson = this._generateConfigFromSeed(partialConfigSeedArgs, playerName, configSeed)
      const configDir = configJson.environment_path
      // FIXME: can we get this from somewhere?
      const adminInterfacePort = 0
      await fs.writeFile(getConfigPath(configDir), YAML.stringify(configJson))
      logger.debug('api.players: player config committed for %s', playerName)
      return new Player({
        name: playerName,
        config: configJson,
        configDir,
        adminInterfacePort,
        spawnConductor: spawnLocal,
        onJoin: () => console.log("FIXME: ignoring onJoin"),//instances.forEach(instance => this._waiter.addNode(instance.dna, playerName)),
        onLeave: () => console.log("FIXME: ignoring onLeave"),//instances.forEach(instance => this._waiter.removeNode(instance.dna, playerName)),
        onActivity: () => this._restartTimer(),
        onSignal: (signal_data) => {},
      })
    }
  }

  _generateConfigFromSeed = (partialConfigSeedArgs: T.PartialConfigSeedArgs, playerName: string, configSeed: T.ConfigSeed): T.RawConductorConfig => {
    const configSeedArgs: T.ConfigSeedArgs = _.assign(partialConfigSeedArgs, {
      scenarioName: this.description,
      playerName,
      uuid: this._uuid
    })
    logger.debug('api.players: seed args generated for %s = %j', playerName, configSeedArgs)
    const configJson = configSeed(configSeedArgs)
    logger.debug("built config: %s", JSON.stringify(configJson))
    if (!configJson.environment_path) {
      throw new Error("Generated config does not have environment_path set")
    }
    return configJson
  }

  _getTrycpClient = async (machineEndpoint: string): Promise<TrycpClient> => {
      logger.debug('api.players: establishing trycp client connection to %s', machineEndpoint)
      const trycpClient = await trycpSession(machineEndpoint)
      logger.debug('api.players: trycp client session established for %s', machineEndpoint)
      return trycpClient
  }

  _clearTimer = () => {
    logger.silly('cleared timer')
    clearTimeout(this._activityTimer)
    this._activityTimer = null
  }

  _restartTimer = () => {
    logger.silly('restarted timer')
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
      this.fail(msg)
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
    logger.debug("Calling Api._cleanup. _localPlayers: %j", this._localPlayers)
    const localKills = await Promise.all(
      _.values(this._localPlayers).map(player => player.cleanup(signal))
    )
    await Promise.all(this._trycpClients.map(async (trycp) => {
      await trycp.reset()
      await trycp.closeSession()
    }))
    this._clearTimer()
    return localKills
  }
}

/**
 * If URLs are present in the config, use TryCP 'dna' method to instruct the remote machine
 * to download the dna, and then replace the URL in the config with the returned local path
 */
// FIXME: convert this for when we get trycp working for RSM
const interpolateConfigDnaUrls = async (trycp: TrycpClient, configJson: T.RawConductorConfig): Promise<any> => {
  configJson = _.cloneDeep(configJson)
  /*
  configJson.dnas = await Promise.all(
    configJson.dnas.map(async (dna) => {
      if (dna.file.match(/^https?:\/\//)) {
        const { path } = await trycp.dna(dna.file)
        return _.set(dna, 'file', path)
      } else {
        return dna
      }
    })
  )*/
  return configJson
}
