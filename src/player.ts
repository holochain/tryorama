import * as _ from 'lodash'

import { Conductor } from './conductor'
import { Instance } from './instance'
import { SpawnConductorFn, ObjectS, RawConductorConfig } from './types';
import { makeLogger } from './logger';
import { unparkPort } from './config/get-port-cautiously'
import { CellId, CallZomeRequest, CellNick, AdminWebsocket } from '@holochain/conductor-api';
import { unimplemented } from './util';
import { fakeCapSecret } from './common';
import env from './env';
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
  _cellIds: ObjectS<CellId>
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
    this._cellIds = {}
    this._configDir = configDir
    this._adminInterfacePort = adminInterfacePort
    this._appInterfacePort = appInterfacePort
    this._spawnConductor = spawnConductor
  }

  admin = (): AdminWebsocket => {
    if (this._conductor) {
      return this._conductor.adminClient!
    } else {
      throw new Error("Conductor is not spawned: admin interface unavailable")
    }
  }

  call = async (...args: CallArgs) => {
    if (args.length === 4) {
      const [cellNick, zome_name, fn_name, payload] = args
      const cell_id = this._cellIds[cellNick]
      if (!cell_id) {
        throw new Error("Unknown cell nick: " + cellNick)
      }
      // FIXME: don't just use provenance from CellId that we're calling,
      //        (because this always grants Authorship)
      //        for now, it makes sense to use the AgentPubKey of the *caller*,
      //        but in the future, Holochain will inject the provenance itself
      //        and you won't even be able to pass it in here.
      const [_dnaHash, provenance] = cell_id
      return this.call({
        cap: fakeCapSecret(), // FIXME
        cell_id,
        zome_name,
        fn_name,
        payload,
        provenance, // FIXME
      })
    } else if (args.length === 1) {
      this._conductorGuard(`call(${JSON.stringify(args[0])})`)
      return this._conductor!.appClient!.callZome(args[0])
    } else {
      throw new Error("Must use either 1 or 4 arguments with `player.call`")
    }
  }

  cellId = (nick: CellNick): CellId => {
    const cellId = this._cellIds[nick]
    if (!cellId) {
      throw new Error(`Unknown cell nickname: ${nick}`)
    }
    return cellId
  }

  stateDump = async (nick: CellNick): Promise<any> => {
    return this.admin()!.dumpState({
      cell_id: this.cellId(nick)
    })
  }

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

    // At this moment we have an admin client, but not an app client

    // Make admin interface calls to actually create cells and app interfaces
    await this._setupConductorViaAdminInterface()

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
    // TODO:
    // When we expand this to allow multiple apps installed per tryorama scenario,
    // we need another layer of nesting, and need to accept app id as a parameter to this fn.
    // For now, use a single app id for all cells.
    const { cell_data } = await this._conductor!.appClient!.appInfo({ app_id: env.singletonAppId })
    for (const [cellId, cellNick] of cell_data) {
      this._cellIds[cellNick] = cellId
    }
  }

  /**
   * Generate agent pub keys and install apps based on player config
   */
  _setupConductorViaAdminInterface = async () => {
    this._conductorGuard('_setupConductorViaAdminInterface')
    const config = this.config  // TODO: this is where we do a big change
    const admin: AdminWebsocket = this._conductor!.adminClient!

    // this comes from some new reimagined PlayerConfig
    const apps: any = {}  // see example.ts

    // determine what agents we need to generate keys for
    const agents = []
    const agentIdToKey = _.fromPairs(await Promise.all(
      agents.map(async name => [name, await admin.generateAgentPubKey()])
    ))

    for (const app of apps) {
      const agent_key = agentIdToKey[app.agentId]
      await admin.installApp({ app_id: app.id, agent_key, dnas: app.dnas })
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
