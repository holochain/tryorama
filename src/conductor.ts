const colors = require('colors/safe')
import uuidGen from 'uuid/v4'

import { KillFn, ConfigSeedArgs } from "./types";
import { makeLogger } from "./logger";
import { delay } from './util';
import env from './env';
import * as T from './types'
import { fakeCapSecret } from "./common";
import { AppId, CellId, CallZomeRequest, CellNick, AdminWebsocket, AppWebsocket, AgentPubKey, InstallAppRequest } from '@holochain/conductor-api';
import { Cell } from "./cell";

// probably unnecessary, but it can't hurt
// TODO: bump this gradually down to 0 until we can maybe remove it altogether
const WS_CLOSE_DELAY_FUDGE = 500

export type CallAdminFunc = (method: string, params: Record<string, any>) => Promise<any>
export type CallZomeFunc = (appId: string, nick: CellNick, zomeName: string, fnName: string, params: Record<string, any>) => Promise<any>

/**
 * Representation of a running Conductor instance.
 * A [Player] spawns a conductor process locally or remotely and constructs this class accordingly.
 * Though Conductor is spawned externally, this class is responsible for establishing WebSocket
 * connections to the various interfaces to enable zome calls as well as admin and signal handling.
 */
export class Conductor {

  name: string
  onSignal: ({ instanceId: string, signal: Signal }) => void
  logger: any
  kill: KillFn
  adminClient: AdminWebsocket | null
  appClient: AppWebsocket | null

  _adminInterfacePort: number
  _machineHost: string
  _isInitialized: boolean
  _rawConfig: T.RawConductorConfig
  _wsClosePromise: Promise<void>
  _onActivity: () => void

  constructor({ name, kill, onSignal, onActivity, machineHost, adminPort, rawConfig }) {
    this.name = name
    this.logger = makeLogger(`tryorama conductor ${name}`)
    this.logger.debug("Conductor constructing")
    this.onSignal = onSignal

    this.kill = async (signal?): Promise<void> => {
      this.logger.debug("Killing...")
      await kill(signal)
      return this._wsClosePromise
    }

    this.adminClient = null
    this.appClient = null
    this._machineHost = machineHost
    this._adminInterfacePort = adminPort
    this._isInitialized = false
    this._rawConfig = rawConfig
    this._wsClosePromise = Promise.resolve()
    this._onActivity = onActivity
  }

  initialize = async () => {
    this._onActivity()
    await this._connectInterfaces()
  }

  awaitClosed = () => this._wsClosePromise

  installHapp = async (agentKey: AgentPubKey, agentHapp: T.AgentHapp): Promise<T.InstalledAgentHapp> => {
    const installAppReq: InstallAppRequest = {
      app_id: `app-${uuidGen()}`,
      agent_key: agentKey,
      dnas: agentHapp.map((dnaPath, index) => ({
        path: dnaPath,
        nick: `${index}${dnaPath}-${uuidGen()}`
      }))
    }
    const {cell_data} = await this.adminClient!.installApp(installAppReq)
    await this.adminClient!.activateApp({ app_id: installAppReq.app_id })
    // construct Cells which are the most useful class to the client
    return cell_data.map(installedCell => new Cell({
      // installedCell[0] is the CellId, installedCell[1] is the CellNick
      // which we don't need
      cellId: installedCell[0],
      adminClient: this.adminClient!,
      appClient: this.appClient!
    }))
  }

  _connectInterfaces = async () => {
    this._onActivity()
    const adminWsUrl = `ws://${this._machineHost}:${this._adminInterfacePort}`
    this.adminClient = await AdminWebsocket.connect(adminWsUrl)
    this.logger.debug(`connectInterfaces :: connected admin interface at ${adminWsUrl}`)
    const { port: appInterfacePort } = await this.adminClient.attachAppInterface({ port: 0 })
    const appWsUrl = `ws://${this._machineHost}:${appInterfacePort}`
    this.appClient = await AppWebsocket.connect(appWsUrl, (signal) => {
      this._onActivity()
      console.info("got signal, doing nothing with it: %o", signal)
    })
    this.logger.debug(`connectInterfaces :: connected app interface at ${appWsUrl}`)
  }
}
