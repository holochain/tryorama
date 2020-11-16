import uuidGen from 'uuid/v4'
import * as _ from 'lodash'
const fs = require('fs').promises
const path = require('path')
const YAML = require('yaml')

import { Waiter, FullSyncNetwork } from '@holochain/hachiko'
import * as T from "./types"
import { Player } from "./player"
import logger from './logger';
import { Orchestrator } from './orchestrator';
import { promiseSerialArray, promiseSerialObject, stringify, stripPortFromUrl, trace } from './util';
import { getConfigPath, localConfigSeedArgs, spawnRemote, spawnLocal } from './config';
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

  _localPlayers: Array<Player>
  _trycpClients: Array<TrycpClient>
  _uuid: string
  _waiter: Waiter
  _modifiers: Modifiers
  _activityTimer: any
  _conductorIndex: number

  constructor(description: string, orchestratorData, uuid: string, modifiers: Modifiers = { singleConductor: false }) {
    this.description = description
    this.fail = (reason) => { throw new Error(`s.fail: ${reason}`) }

    this._localPlayers = []
    this._trycpClients = []
    this._uuid = uuid
    this._waiter = new Waiter(FullSyncNetwork, undefined, orchestratorData.waiterConfig)
    this._modifiers = modifiers
    this._activityTimer = null
    this._conductorIndex = 0
  }

  players = async (playerConfigs: Array<T.PlayerConfig>, startupArg: boolean = true): Promise<Array<Player>> => {
    logger.debug('api.players: creating players')

    // validation
    playerConfigs.forEach((pc, i) => {
      if (!_.isFunction(pc)) {
        throw new Error(`Config for player at index ${i} contains something other than a function. Either use Config.gen to create a seed function, or supply one manually.`)
      }
    })

    // create all the promise *creators* which will
    // create the players
    const playerBuilders: Array<PlayerBuilder> = await Promise.all(playerConfigs.map(
      async configSeed => {
        // use the _conductorIndex and then increment it
        const playerName = `c${this._conductorIndex++}`
        // local machine
        return await this._createLocalPlayerBuilder(playerName, configSeed)
        // TODO: trycp
        // await this._createTrycpPlayerBuilder(machineEndpoint, playerName, playerConfigSeed)
      }
    ))

    // this will throw an error if something is wrong

    // now sequentially build the players
    const players = await promiseSerialArray<Player>(playerBuilders.map(pb => pb()))
    logger.debug('api.players: players built')

    // since this function can be called multiple times, make sure
    // to keep any existing _localPlayers while adding the new ones
    this._localPlayers = this._localPlayers.concat(players)

    // spawn/startup the players if instructed to
    if (startupArg) {
      for (const player of players) {
        // logger.info('api.players: auto-starting-up player %s', player.name)
        await player.startup({})
        // logger.info('api.players: startup complete for %s', player.name)
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

  // TODO: re-implement a way to create a trycp player
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

  _createLocalPlayerBuilder = async (playerName: string, configSeed: T.ConfigSeed): Promise<PlayerBuilder> => {
    return async () => {
      const partialConfigSeedArgs = await localConfigSeedArgs()
      const configJson = this._generateConfigFromSeed(partialConfigSeedArgs, playerName, configSeed)
      const { adminInterfacePort, configDir } = partialConfigSeedArgs
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
