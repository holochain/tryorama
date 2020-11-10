const colors = require('colors/safe')

import { KillFn, ConfigSeedArgs } from "./types";
import { makeLogger } from "./logger";
import { delay } from './util';
import env from './env';
import * as T from './types'
import { fakeCapSecret } from "./common";
import { AppId, CellId, CallZomeRequest, CellNick, AdminWebsocket, AppWebsocket, AgentPubKey, InstallAppRequest } from '@holochain/conductor-api';

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
  _cellIds: T.ObjectS<T.ObjectS<CellId>>

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
    this._cellIds = {}
  }

  callZome: CallZomeFunc = (...a) => {
    throw new Error("Attempting to call zome function before conductor was initialized")
  }

  initialize = async () => {
    this._onActivity()
    await this._connectInterfaces()
  }

  awaitClosed = () => this._wsClosePromise

  cellId = (appId: string, nick: CellNick): CellId => {
    const cellId = this._cellIds[appId][nick]
    if (!cellId) {
      throw new Error(`Unknown cell nickname: ${nick} in app: ${appId}`)
    }
    return cellId
  }

  installApp = async (agent_key: AgentPubKey, app: T.HappBundle) => {
    const installAppReq : InstallAppRequest = {
      app_id: app.id,
      agent_key,
      dnas: app.dnas
    }
    const {cell_data: cellData} = await this.adminClient!.installApp(installAppReq)
    // save the returned cellIds and cellNicks for later reference
    for (const installedCell of cellData) {
      const [cellId, cellNick] = installedCell
      this._cellIds[app.id][cellNick] = cellId
    }
  }

  _loadCellNicks = async (app_id: AppId) => {
    const { cell_data } = await this.appClient!.appInfo({ app_id })
    for (const [cellId, cellNick] of cell_data) {
      this._cellIds[app_id][cellNick] = cellId
    }
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

    // get the currently existing apps and cell nick/id mapping
    const apps = await this.adminClient.listActiveAppIds()
    for (const app_id of apps) {
      await this._loadCellNicks(app_id)
    }

    // now that we are connected updated the callZome function
    this.callZome = (appId, cellNick, zomeName, fnName, payload) => {
      this._onActivity()

      const cellId = this.cellId(appId, cellNick)
      if (!cellId) {
        throw new Error("Unknown cell nick: " + cellNick)
      }
      // FIXME: don't just use provenance from CellId that we're calling,
      //        (because this always grants Authorship)
      //        for now, it makes sense to use the AgentPubKey of the *caller*,
      //        but in the future, Holochain will inject the provenance itself
      //        and you won't even be able to pass it in here.
      const [_dnaHash, provenance] = cellId
      return this.appClient!.callZome({
        cell_id: cellId as any,
        zome_name: zomeName,
        cap: fakeCapSecret(), // FIXME (see Player.ts)
        fn_name: fnName,
        payload: payload,
        provenance, // FIXME
      })
    }
  }
}
