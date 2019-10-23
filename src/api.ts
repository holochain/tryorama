import * as _ from 'lodash'
const fs = require('fs').promises
const path = require('path')
const TOML = require('@iarna/toml')

import { Waiter, FullSyncNetwork } from '@holochain/hachiko'
import * as T from "./types"
import { Player } from "./player"
import logger from './logger';
import { Orchestrator } from './orchestrator';
import { promiseSerialObject, delay } from './util';
import { getConfigPath, genConfig, assertUniqueTestAgentNames } from './config';
import env from './env'

type Modifiers = {
  singleConductor: boolean
}

type AnyConfig = T.GenConfigFn | T.EitherConductorConfig

const DEFAULT_CONDUCTOR_ACTIVITY_TIMEOUT = 120000

export class ScenarioApi {

  description: string
  conductorTimeoutMs: number

  _players: Array<Player>
  _uuid: string
  _orchestrator: Orchestrator
  _waiter: Waiter
  _modifiers: Modifiers
  _activityTimer: any

  constructor(description: string, orchestrator: Orchestrator, uuid: string, modifiers: Modifiers = { singleConductor: false }) {
    this.description = description
    this.conductorTimeoutMs = DEFAULT_CONDUCTOR_ACTIVITY_TIMEOUT
    this._players = []
    this._uuid = uuid
    this._orchestrator = orchestrator
    this._waiter = new Waiter(FullSyncNetwork, undefined, orchestrator.waiterConfig)
    this._modifiers = modifiers
    this._activityTimer = null
  }

  players = async (configs: T.ObjectS<AnyConfig> | Array<AnyConfig>, start?: boolean): Promise<T.ObjectS<Player>> => {
    logger.debug('creating players')
    const players = {}
    // if passing an array, convert to an object with keys as stringified indices. Otherwise just get the key, value pairs
    const entries: Array<[string, AnyConfig]> = _.isArray(configs)
      ? configs.map((v, i) => [String(i), v])
      : Object.entries(configs)
    const configsIntermediate = await Promise.all(entries.map(async ([name, config]) => {
      const genConfigArgs = await this._orchestrator._genConfigArgs(name, this._uuid)
      // If an object was passed in, run it through genConfig first. Otherwise use the given function.
      const configBuilder = _.isFunction(config)
        ? (config as T.GenConfigFn)
        : genConfig(config as T.EitherConductorConfig, this._orchestrator._globalConfig)
      const configToml = await configBuilder(genConfigArgs)
      const configJson = TOML.parse(configToml)
      return { name, configJson, configToml, genConfigArgs }
    }))

    logger.debug('deduping agent ids')
    assertUniqueTestAgentNames(configsIntermediate.map(c => c.configJson))

    configsIntermediate.forEach(({ name, configJson, configToml, genConfigArgs }) => {
      players[name] = (async () => {
        const { instances } = configJson
        await fs.writeFile(getConfigPath(genConfigArgs.configDir), configToml)

        const player = new Player({
          name,
          genConfigArgs,
          spawnConductor: this._orchestrator._spawnConductor,
          onJoin: () => instances.forEach(instance => this._waiter.addNode(instance.dna, name)),
          onLeave: () => instances.forEach(instance => this._waiter.removeNode(instance.dna, name)),
          onActivity: () => this._restartTimer(),
          onSignal: ({ instanceId, signal }) => {
            const instance = instances.find(c => c.id === instanceId)
            const dnaId = instance!.dna
            const observation = {
              dna: dnaId,
              node: name,
              signal
            }
            this._waiter.handleObservation(observation)
          },
        })
        if (start) {
          await player.spawn()
        }
        this._players.push(player)
        return player
      })()
    })
    const ps = await promiseSerialObject<Player>(players)
    if (start) {
      logger.warn("Waiting for conductors to settle... (TODO check back later to see if this is necessary)")
      await delay(100)
    }
    return ps
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

  globalConfig = (): T.GlobalConfig => this._orchestrator._globalConfig

  _clearTimer = () => {
    logger.debug('cleared timer')
    clearTimeout(this._activityTimer)
    this._activityTimer = null
  }

  _restartTimer = () => {
    logger.debug('restarted timer')
    clearTimeout(this._activityTimer)
    this._activityTimer = setTimeout(() => this._destroyConductors(), this.conductorTimeoutMs)
  }

  _destroyConductors = async () => {
    const kills = await this._cleanup('SIGKILL')
    this._clearTimer()
    const names = this._players.filter((player, i) => kills[i]).map(player => player.name)
    names.sort()
    const msg = `
The following conductors were forcefully shutdown after ${this.conductorTimeoutMs / 1000} seconds of no activity:
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
      this._players.map(player => player.cleanup(signal))
    )
    this._clearTimer()
    return kills
  }

}
