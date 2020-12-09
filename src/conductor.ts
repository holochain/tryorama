const colors = require('colors/safe')
import uuidGen from 'uuid/v4'

import { KillFn } from "./types";
import { makeLogger } from "./logger";
import { delay } from './util';
import env from './env';
import * as T from './types'
import { CellNick, AdminWebsocket, AppWebsocket, AgentPubKey, InstallAppRequest, DnaProperties } from '@holochain/conductor-api';
import { Cell } from "./cell";
import { Player } from './player';

// probably unnecessary, but it can't hurt
// TODO: bump this gradually down to 0 until we can maybe remove it altogether
const WS_CLOSE_DELAY_FUDGE = 500

export type CallAdminFunc = (method: string, params: Record<string, any>) => Promise<any>

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

  _player: Player
  _adminInterfacePort: number
  _machineHost: string
  _isInitialized: boolean
  _rawConfig: T.RawConductorConfig
  _wsClosePromise: Promise<void>
  _onActivity: () => void

  constructor({ player, name, kill, onSignal, onActivity, machineHost, adminPort, rawConfig }) {
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
    this._player = player
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

  // this function will auto-generate an `installed_app_id` and
  // `dna.nick` for you, to allow simplicity
  installHapp = async (agentHapp: T.InstallHapp, agentPubKey?: AgentPubKey): Promise<T.InstalledHapp> => {
    if (!agentPubKey) {
      agentPubKey = await this.adminClient!.generateAgentPubKey()
    }
    const dnaPaths: T.DnaPath[] = agentHapp
    const installAppReq: InstallAppRequest = {
      installed_app_id: `app-${uuidGen()}`,
      agent_key: agentPubKey,
      dnas: dnaPaths.map((dnaPath, index) => ({
        path: dnaPath,
        nick: `${index}${dnaPath}-${uuidGen()}`,
        properties: {uuid: this._player.scenarioUUID},
      }))
    }
    console.log("INSTALLING: ", installAppReq)
    return await this._installHapp(installAppReq)
  }

  // install a hApp using the InstallAppRequest struct from conductor-admin-api
  // you must create your own app_id and dnas list, this is usefull also if you
  // need to pass in properties or membrane-proof
  _installHapp = async (installAppReq: InstallAppRequest): Promise<T.InstalledHapp> => {
    const {cell_data} = await this.adminClient!.installApp(installAppReq)
    // must be activated to be callable
    await this.adminClient!.activateApp({ installed_app_id: installAppReq.installed_app_id })

    // prepare the result, and create Cell instances
    const installedAgentHapp: T.InstalledHapp = {
      hAppId:  installAppReq.installed_app_id,
      agent: installAppReq.agent_key,
      // construct Cell instances which are the most useful class to the client
      cells: cell_data.map(installedCell => new Cell({
        // installedCell[0] is the CellId, installedCell[1] is the CellNick
        cellId: installedCell[0],
        cellNick: installedCell[1],
        player: this._player
      }))
    }
    return installedAgentHapp
  }

  _connectInterfaces = async () => {
    this._onActivity()
    const adminWsUrl = `ws://${this._machineHost}:${this._adminInterfacePort}`
    this.adminClient = await AdminWebsocket.connect(adminWsUrl)
    this.logger.debug(`connectInterfaces :: connected admin interface at ${adminWsUrl}`)
    // 0 in this case means use any open port
    const { port: appInterfacePort } = await this.adminClient.attachAppInterface({ port: 0 })
    const appWsUrl = `ws://${this._machineHost}:${appInterfacePort}`
    this.appClient = await AppWebsocket.connect(appWsUrl, (signal) => {
      this._onActivity()
      console.info("got signal, doing nothing with it: %o", signal)
    })
    this.logger.debug(`connectInterfaces :: connected app interface at ${appWsUrl}`)
  }
}
