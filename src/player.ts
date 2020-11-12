import * as _ from 'lodash'

import { Conductor } from './conductor'
import { Cell } from './cell'
import { SpawnConductorFn, ObjectS, RawConductorConfig, InstalledHapps, InstallHapps, InstalledAgentHapp, AgentHapp } from './types';
import { makeLogger } from './logger';
import { unparkPort } from './config/get-port-cautiously'
import { CellId, CallZomeRequest, CellNick, AdminWebsocket, AgentPubKey } from '@holochain/conductor-api';
import { unimplemented } from './util';
import { fakeCapSecret } from './common';
import env from './env';
const fs = require('fs').promises

type ConstructorArgs = {
  name: string,
  config: RawConductorConfig,
  configDir: string,
  adminInterfacePort: number,
  onSignal: ({ instanceId: string, signal: Signal }) => void,
  onJoin: () => void,
  onLeave: () => void,
  onActivity: () => void,
  spawnConductor: SpawnConductorFn,
}

type CallArgs = [CallZomeRequest] | [string, string, string, string, any]

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
  _configDir: string
  _adminInterfacePort: number
  _spawnConductor: SpawnConductorFn
  _cells: ObjectS<Cell>

  constructor({ name, config, configDir, adminInterfacePort, onJoin, onLeave, onSignal, onActivity, spawnConductor }: ConstructorArgs) {
    this.name = name
    this.logger = makeLogger(`player ${name}`)
    this.onJoin = onJoin
    this.onLeave = onLeave
    this.onSignal = onSignal
    this.onActivity = onActivity
    this.config = config

    this._conductor = null
    this._configDir = configDir
    this._adminInterfacePort = adminInterfacePort
    this._spawnConductor = spawnConductor
    this._cells = {}
  }

  admin = (): AdminWebsocket => {
    if (this._conductor) {
      return this._conductor.adminClient!
    } else {
      throw new Error("Conductor is not spawned: admin interface unavailable")
    }
  }

  /**
   * `startup` can take a function as an argument, which allows the caller
   * to do something with the child process handle, even before the conductor
   * has fully started up. Otherwise, by default, you will have to wait for
   * the proper output to be seen before this promise resolves.
   */
  startup = async (spawnArgs: any) => {
    if (this._conductor) {
      this.logger.warn(`Attempted to start up conductor '${this.name}' twice!`)
      return
    }

    this.onJoin()
    this.logger.debug("starting up")
    const conductor = await this._spawnConductor(this, spawnArgs)

    this.logger.debug("started up")
    this._conductor = conductor

    this.logger.debug("initializing")
    await this._conductor.initialize()

    this.logger.debug("initialized")
  }

  shutdown = async (signal = 'SIGINT'): Promise<boolean> => {
    if (this._conductor) {
      const c = this._conductor
      this._conductor = null
      this.logger.debug("Shutting down...")
      await c.kill(signal)
      this.logger.debug("Shut down.")
      this.onLeave()
      return true
    } else {
      this.logger.warn(`Attempted to shut down conductor '${this.name}' twice`)
      return false
    }
  }

  /** Runs at the end of a test run */
  cleanup = async (signal = 'SIGINT'): Promise<boolean> => {
    this.logger.debug("calling Player.cleanup, conductor: %b", this._conductor)
    if (this._conductor) {
      await this.shutdown(signal)
      unparkPort(this._adminInterfacePort)
      return true
    } else {
      unparkPort(this._adminInterfacePort)
      return false
    }
  }

  /**
   * helper to create agent pub keys and install multiple apps for scenario initialization
   */
  installHapps = async (happs: InstallHapps): Promise<InstalledHapps> => {
    this._conductorGuard(`Player.installHapps`)
    const installedHapps: InstalledHapps = []
    for (const agentHapp of happs) {
      const installedHapp = await this.installHapp(agentHapp)
      installedHapps.push(installedHapp)
    }
    return installedHapps
  }

  /**
   * expose installApp at the player level for in-scenario dynamic installation of apps
   */
  installHapp = async (agentHapp: AgentHapp, agentPubKey?: AgentPubKey): Promise<InstalledAgentHapp> => {
    this._conductorGuard(`Player.installHapp(${JSON.stringify(agentHapp)}, ${agentPubKey})`)
    const admin: AdminWebsocket = this._conductor!.adminClient!
    if (!agentPubKey) {
      agentPubKey = await admin.generateAgentPubKey()
    }
    return this._conductor!.installHapp(agentPubKey, agentHapp)
  }

  _conductorGuard = (context) => {
    if (this._conductor === null) {
      const msg = `Attempted conductor action when no conductor is running! You must \`.startup()\` first.\nAction: ${context}`
      this.logger.error(msg)
      throw new Error(msg)
    } else {
      this.logger.debug(context)
    }
  }
}
