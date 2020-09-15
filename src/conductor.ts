const colors = require('colors/safe')

import { KillFn, ConfigSeedArgs } from "./types";
import { makeLogger } from "./logger";
import { delay } from './util';
import env from './env';
import { connect as legacyConnect } from '@holochain/hc-web-client'
import { AdminWebsocket, AppWebsocket } from '@holochain/conductor-api'
import * as T from './types'
import { fakeCapSecret } from "./common";

// probably unnecessary, but it can't hurt
// TODO: bump this gradually down to 0 until we can maybe remove it altogether
const WS_CLOSE_DELAY_FUDGE = 500

export type CallAdminFunc = (method: string, params: Record<string, any>) => Promise<any>
export type CallZomeFunc = (instanceId: string, zomeName: string, fnName: string, params: Record<string, any>) => Promise<any>

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

  _adminWsUrl: string
  _appWsUrl: string
  _isInitialized: boolean
  _rawConfig: T.RawConductorConfig
  _wsClosePromise: Promise<void>
  _onActivity: () => void

  constructor({ name, kill, onSignal, onActivity, appWsUrl, adminWsUrl, rawConfig }) {
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
    this._adminWsUrl = adminWsUrl
    this._appWsUrl = appWsUrl
    this._isInitialized = false
    this._rawConfig = rawConfig
    this._wsClosePromise = Promise.resolve()
    this._onActivity = onActivity
  }

  callZome: CallZomeFunc = (...a) => {
    throw new Error("Attempting to call zome function before conductor was initialized")
  }

  initialize = async () => {
    this._onActivity()
    await this._connectInterfaces()
  }

  awaitClosed = () => this._wsClosePromise

  _connectInterfaces = async () => {
    this._onActivity()

    this.adminClient = await AdminWebsocket.connect(this._adminWsUrl)
    this.logger.debug(`connectInterfaces :: connected admin interface at ${this._adminWsUrl}`)

    this.appClient = await AppWebsocket.connect(this._appWsUrl, (signal) => {
      this._onActivity()
      console.info("got signal, doing nothing with it: %o", signal)
    })
    this.logger.debug(`connectInterfaces :: connected app interface at ${this._appWsUrl}`)

    // FIXME
    this.appClient = await AppWebsocket.connect(this._appWsUrl, signal => {
      // TODO: do something meaningful with signals
      this.logger.info("received app signal: %o", signal)
    })
    this.logger.debug(`connectInterfaces :: connected app interface at ${this._appWsUrl}`)

    this.callZome = (instanceId, zomeName, fnName, payload) => {
      this._onActivity()

      const cellId: T.CellId = cellIdFromInstanceId(this._rawConfig, instanceId)

      return this.appClient!.callZome({
        cell_id: cellId as any,
        zome_name: zomeName,
        cap: fakeCapSecret(),
        fn_name: fnName,
        payload: payload,
        provenance: 'TODO' as any
      })
    }
  }
}


export const cellIdFromInstanceId = (config: T.RawConductorConfig, instanceId: string): T.CellId => {
  const instance = config.instances.find(i => i.id === instanceId)!
  const dnaHash = config.dnas.find(d => d.id === instance.dna)!.hash!
  const agentKey = config.agents.find(a => a.id === instance.agent)!.public_address
  return [dnaHash, agentKey]
}
