import * as _ from 'lodash'

import { Conductor } from './conductor'
import { Cell } from './cell'
import { SpawnConductorFn, ObjectS, RawConductorConfig, InstalledHapps, InstallHapps, InstallAgentsHapps, InstalledAgentHapps, InstallHapp, InstalledHapp } from './types';
import { makeLogger } from './logger';
import { unparkPort } from './config/get-port-cautiously'
import { CellId, CallZomeRequest, CellNick, AdminWebsocket, AgentPubKey, InstallAppRequest, AppWebsocket, HoloHash, AppBundleSource } from '@holochain/conductor-api';
import { unimplemented } from './util';
import { fakeCapSecret } from './common';
import env from './env';
import * as T from './types'
import { TunneledAdminClient, TunneledAppClient } from './trycp';
const fs = require('fs').promises

type ConstructorArgs = {
  scenarioUUID: string,
  name: string,
  config: RawConductorConfig,
  adminInterfacePort?: number,
  onJoin: () => void,
  onLeave: () => void,
  onActivity: () => void,
  spawnConductor: SpawnConductorFn,
}


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
  onSignal: ((signal: any) => void) | null = null
  onActivity: () => void
  scenarioUUID: string

  _conductor: Conductor | null
  _adminInterfacePort?: number
  _spawnConductor: SpawnConductorFn

  constructor({ scenarioUUID, name, config, adminInterfacePort, onJoin, onLeave, onActivity, spawnConductor }: ConstructorArgs) {
    this.name = name
    this.logger = makeLogger(`player ${name}`)
    this.onJoin = onJoin
    this.onLeave = onLeave
    this.onActivity = onActivity
    this.config = config
    this.scenarioUUID = scenarioUUID,

      this._conductor = null
    this._adminInterfacePort = adminInterfacePort
    this._spawnConductor = spawnConductor
  }

  appWs = (context?: string): AppWebsocket | TunneledAppClient => {
    this._conductorGuard(context || `Player.appWs()`)
    return this._conductor!.appClient!
  }

  adminWs = (context?: string): AdminWebsocket | TunneledAdminClient => {
    this._conductorGuard(context || `Player.adminWs()`)
    return this._conductor!.adminClient!
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

  shutdown = async (signal = 'SIGTERM'): Promise<boolean> => {
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
  cleanup = async (signal = 'SIGTERM'): Promise<boolean> => {
    this.setSignalHandler(null)
    this.logger.debug("calling Player.cleanup, conductor: %b", this._conductor)
    if (this._conductor) {
      await this.shutdown(signal)
      if (this._adminInterfacePort !== undefined) {
        unparkPort(this._adminInterfacePort)

      }
    }
    if (this._adminInterfacePort !== undefined) {
      unparkPort(this._adminInterfacePort)
    }
    return this._conductor !== null
  }

  /**
   * helper to create agent keys and install multiple apps for scenario initialization
   */
  installAgentsHapps = (agentsHapps: InstallAgentsHapps): Promise<InstalledAgentHapps> => {
    this._conductorGuard(`Player.installHapps`)
    return Promise.all(agentsHapps.map(async agentHapps => {
      // for each agent, create one key and install all the happs under that key
      const agentPubKey: AgentPubKey = await this.adminWs().generateAgentPubKey()
      return Promise.all(agentHapps.map(happ => this.installHapp(happ, agentPubKey)))
    }))
  }

  /**
   * expose registerDna at the player level for in-scenario dynamic installation of apps
   */
  registerDna = async (source: T.DnaSource, ...params): Promise<HoloHash> => {
    this._conductorGuard(`Player.registerDna(source ${JSON.stringify(source)}, params ${JSON.stringify(params)})`)
    return this._conductor!.registerDna(source, ...params)
  }

  /**
   * expose installBundledHapp at the player level for in-scenario dynamic installation of apps
   * optionally takes an AgentPubKey so that you can control who's who if you need to
   * otherwise will be a new and different agent every time you call it
   */
  installBundledHapp = async (bundleSource: AppBundleSource, agentPubKey?: AgentPubKey): Promise<InstalledHapp> => {
    this._conductorGuard(`Player.installBundledHapp(${JSON.stringify(bundleSource)}, ${agentPubKey ? 'noAgentPubKey' : 'withAgentPubKey'})`)
    return this._conductor!.installBundledHapp(bundleSource, agentPubKey)
  }

  /**
   * expose installHapp at the player level for in-scenario dynamic installation of apps
   * optionally takes an AgentPubKey so that you can control who's who if you need to
   * otherwise will be a new and different agent every time you call it
   */
  installHapp = async (happ: InstallHapp, agentPubKey?: AgentPubKey): Promise<InstalledHapp> => {
    this._conductorGuard(`Player.installHapp(${JSON.stringify(happ)}, ${agentPubKey ? 'noAgentPubKey' : 'withAgentPubKey'})`)
    return this._conductor!.installHapp(happ, agentPubKey)
  }

  /**
   * expose _installHapp at the player level for in-scenario dynamic installation of apps
   * using admin api's InstallAppRequest for more detailed control
   */
  _installHapp = async (happ: InstallAppRequest): Promise<InstalledHapp> => {
    this._conductorGuard(`Player._installHapp(${JSON.stringify(happ)})`)
    return this._conductor!._installHapp(happ)
  }

  setSignalHandler = (handler) => {
    this.onSignal = handler
    if (this._conductor) {
      this._conductor.setSignalHandler(handler)
    }
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
