import * as _ from 'lodash'

import { Signal, DnaId } from '@holochain/hachiko'

import { Conductor, CallZomeFunc, CallAdminFunc } from './conductor'
import { Instance } from './instance'
import { ConfigSeedArgs, SpawnConductorFn, ObjectS, ObjectN, RawConductorConfig } from './types';
import { makeLogger } from './logger';
import { unparkPort } from './config/get-port-cautiously'
import { CellId, CallZomeRequest } from '@holochain/conductor-api';
import { unimplemented } from './util';
const fs = require('fs').promises

type ConstructorArgs = {
  name: string,
  config: RawConductorConfig,
  configDir: string,
  adminInterfacePort: number,
  appInterfacePort: number,
  onSignal: ({ instanceId: string, signal: Signal }) => void,
  onJoin: () => void,
  onLeave: () => void,
  onActivity: () => void,
  spawnConductor: SpawnConductorFn,
}

type CallArgs = [CallZomeRequest] | [string, string, string, any]

/**
 * Representation of a Conductor user.
 * A Player is essentially a wrapper around a conductor config that was generated,
 * and the possible reference to a conductor which is running based on that config.
 * The Player can spawn or kill a conductor based on the generated config.
 * Players are the main interface for writing scenarios.
 */
export class Player {

  name: string
  logger: any
  config: RawConductorConfig
  onJoin: () => void
  onLeave: () => void
  onSignal: ({ instanceId: string, signal: Signal }) => void
  onActivity: () => void

  _conductor: Conductor | null
  _cellNicks: ObjectS<CellId>
  _dnaIds: Array<DnaId>
  _configDir: string
  _adminInterfacePort: number
  _appInterfacePort: number
  _spawnConductor: SpawnConductorFn

  constructor({ name, config, configDir, adminInterfacePort, appInterfacePort, onJoin, onLeave, onSignal, onActivity, spawnConductor }: ConstructorArgs) {
    this.name = name
    this.logger = makeLogger(`player ${name}`)
    this.onJoin = onJoin
    this.onLeave = onLeave
    this.onSignal = onSignal
    this.onActivity = onActivity
    this.config = config

    this._conductor = null
    this._cellNicks = {}
    this._configDir = configDir
    this._adminInterfacePort = adminInterfacePort
    this._appInterfacePort = appInterfacePort
    this._spawnConductor = spawnConductor
  }

  admin = () => {
    if (this._conductor) {
      return this._conductor.adminClient
    } else {
      throw new Error("Conductor is not spawned: admin interface unavailable")
    }
  }

  call = async (...args: CallArgs) => {
    if (args.length === 4) {
      const [cellNick, zome_name, fn_name, payload] = args
      if (!this._cellNicks[cellNick]) {
        throw new Error("Unknown cell nick: " + cellNick)
      }
      const cell_id = this._cellNicks[cellNick]
      return this.call({
        cap: 'TODO',
        cell_id,
        zome_name,
        fn_name,
        payload,
        provenance: 'TODO',
      })
    } else if (args.length === 1) {
      this._conductorGuard(`call(${JSON.stringify(args[0])})`)
      return this._conductor!.appClient!.callZome(args[0])
    } else {
      throw new Error("Must use either 1 or 4 arguments with `player.call`")
    }
  }


  callLegacy: CallZomeFunc = async (...args): Promise<any> => {
    const [instanceId, zome, fn, params] = args
    if (args.length != 4 || typeof instanceId !== 'string' || typeof zome !== 'string' || typeof fn !== 'string') {
      throw new Error("player.call() must take 4 arguments: (instanceId, zomeName, funcName, params)")
    }
    this._conductorGuard(`call(${instanceId}, ${zome}, ${fn}, ${JSON.stringify(params)})`)
    return this._conductor!.callZome(instanceId, zome, fn, params)
  }

  stateDump = (id: string): Promise<any> => unimplemented("Player.stateDump")

  /**
   * Get a particular Instance of this conductor.
   * The reason for supplying a getter rather than allowing direct access to the collection
   * of instances is to allow middlewares to modify the instanceId being retrieved,
   * especially for singleConductor middleware
   */
  instance = (instanceId) => {
    this._conductorGuard(`instance(${instanceId})`)
    unimplemented("Player.instance")
    // return _.cloneDeep(this._instances[instanceId])
  }

  instances = (filterPredicate?): Array<Instance> => {
    unimplemented("Player.instances")
    return []
    // return _.flow(_.values, _.filter(filterPredicate), _.cloneDeep)(this._instances)
  }

  /**
   * Spawn can take a function as an argument, which allows the caller
   * to do something with the child process handle, even before the conductor
   * has fully started up. Otherwise, by default, you will have to wait for
   * the proper output to be seen before this promise resolves.
   */
  spawn = async (spawnArgs: any) => {
    if (this._conductor) {
      this.logger.warn(`Attempted to spawn conductor '${this.name}' twice!`)
      return
    }

    await this.onJoin()
    this.logger.debug("spawning")
    const conductor = await this._spawnConductor(this, spawnArgs)

    this.logger.debug("spawned")
    this._conductor = conductor

    this.logger.debug("initializing")
    await this._conductor.initialize()
    await this._setCellNicks()
    this.logger.debug("initialized")
  }

  kill = async (signal = 'SIGINT'): Promise<boolean> => {
    if (this._conductor) {
      const c = this._conductor
      this._conductor = null
      this.logger.debug("Killing...")
      await c.kill(signal)
      this.logger.debug("Killed.")
      await this.onLeave()
      return true
    } else {
      this.logger.warn(`Attempted to kill conductor '${this.name}' twice`)
      return false
    }
  }

  /** Runs at the end of a test run */
  cleanup = async (signal = 'SIGINT'): Promise<boolean> => {
    this.logger.debug("calling Player.cleanup, conductor: %b", this._conductor)
    if (this._conductor) {
      await this.kill(signal)
      unparkPort(this._adminInterfacePort)
      unparkPort(this._appInterfacePort)
      return true
    } else {
      unparkPort(this._adminInterfacePort)
      unparkPort(this._appInterfacePort)
      return false
    }
  }

  _setCellNicks = async () => {
    const { cell_data } = await this._conductor!.appClient!.appInfo({ app_id: 'LEGACY' })
    for (const [cellId, cellNick] of cell_data) {
      this._cellNicks[cellNick] = cellId
    }
  }

  _conductorGuard = (context) => {
    if (this._conductor === null) {
      const msg = `Attempted conductor action when no conductor is running! You must \`.spawn()\` first.\nAction: ${context}`
      this.logger.error(msg)
      throw new Error(msg)
    } else {
      this.logger.debug(context)
    }
  }

}
