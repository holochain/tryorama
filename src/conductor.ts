const colors = require('colors/safe')
import { v4 as uuidGen } from 'uuid'

import { KillFn } from "./types";
import { makeLogger } from "./logger";
import { delay } from './util';
import env from './env';
import * as T from './types'
import { CellNick, AdminWebsocket, AppWebsocket, AgentPubKey, InstallAppRequest, RegisterDnaRequest, HoloHash, DnaProperties } from '@holochain/conductor-api';
import { Cell } from "./cell";
import { Player } from './player';
import { TunneledAdminClient, TunneledAppClient } from './trycp'
import * as fs from 'fs'

// probably unnecessary, but it can't hurt
// TODO: bump this gradually down to 0 until we can maybe remove it altogether
const WS_CLOSE_DELAY_FUDGE = 500

export type CallAdminFunc = (method: string, params: Record<string, any>) => Promise<any>

type ConstructorArgs = {
  player: Player,
  name: string,
  kill: (string?) => Promise<void>,
  onSignal: (Signal) => void,
  onActivity: () => void,
  machineHost: string,
  adminPort?: number
  adminInterfaceCall?: (any) => Promise<any>,
  appInterfaceCall?: (port: number, message: any) => Promise<any>,
  downloadDnaRemote?: (string) => Promise<{ path: string }>,
  saveDnaRemote?: (id: string, buffer_callback: () => Promise<Buffer>) => Promise<{ path: string }>,
}

/**
 * Representation of a running Conductor instance.
 * A [Player] spawns a conductor process locally or remotely and constructs this class accordingly.
 * Though Conductor is spawned externally, this class is responsible for establishing WebSocket
 * connections to the various interfaces to enable zome calls as well as admin and signal handling.
 */
export class Conductor {

  name: string
  onSignal: (Signal) => void
  logger: any
  kill: KillFn
  adminClient: AdminWebsocket | TunneledAdminClient | null
  appClient: AppWebsocket | TunneledAppClient | null

  _player: Player
  _adminInterfacePort?: number
  _machineHost: string
  _isInitialized: boolean
  _wsClosePromise: Promise<void>
  _onActivity: () => void
  _timeout: number
  _appInterfaceCall?: (port: number, message: any) => Promise<any>
  _downloadDnaRemote?: (string) => Promise<{ path: string }>
  _saveDnaRemote?: (id: string, buffer_callback: () => Promise<Buffer>) => Promise<{ path: string }>


  constructor({ player, name, kill, onSignal, onActivity, machineHost, adminPort, adminInterfaceCall, appInterfaceCall, downloadDnaRemote, saveDnaRemote }: ConstructorArgs) {
    this.name = name
    this.logger = makeLogger(`tryorama conductor ${name}`)
    this.logger.debug("Conductor constructing")
    this.onSignal = onSignal

    this.kill = async (signal?): Promise<void> => {
      this.logger.debug("Killing...")
      await kill(signal)
      return await this._wsClosePromise
    }

    if (adminInterfaceCall !== undefined) {
      this.adminClient = new TunneledAdminClient(async (message) => {
        const res = await adminInterfaceCall(message)
        this._onActivity()
        return res
      })
    } else {
      this.adminClient = null
    }
    this.appClient = null
    this._player = player
    this._machineHost = machineHost
    this._adminInterfacePort = adminPort
    this._isInitialized = false
    this._wsClosePromise = Promise.resolve()
    this._onActivity = onActivity
    this._timeout = 30000
    this._appInterfaceCall = appInterfaceCall
    this._downloadDnaRemote = downloadDnaRemote
    this._saveDnaRemote = saveDnaRemote
  }

  initialize = async () => {
    this._onActivity()
    await this._connectInterfaces()
  }

  awaitClosed = () => this._wsClosePromise

  // this function registers a DNA from a given source
  registerDna = async (source: T.DnaSource, uuid?, properties?): Promise<HoloHash> => {
    const registerDnaReq: RegisterDnaRequest = { source, uuid, properties }
    return await this.adminClient!.registerDna(registerDnaReq)
  }

  // this function will auto-generate an `installed_app_id` and
  // `dna.nick` for you, to allow simplicity
  installHapp = async (agentHapp: T.InstallHapp, agentPubKey?: AgentPubKey): Promise<T.InstalledHapp> => {
    if (!agentPubKey) {
      agentPubKey = await this.adminClient!.generateAgentPubKey()
    }
    const dnaSources: T.DnaSrc[] = agentHapp
    const installAppReq: InstallAppRequest = {
      installed_app_id: `app-${uuidGen()}`,
      agent_key: agentPubKey,
      dnas: await Promise.all(dnaSources.map(async (source, index) => {
        let dna = {
          nick: `${index}${source}-${uuidGen()}`,
          uuid: this._player.scenarioUUID,
        }
        if ((source as T.DnaUrl).url !== undefined) {
          if (this._downloadDnaRemote === undefined) {
            throw new Error("encountered URL DNA source on non-remote player")
          }
          const { path: remotePath } = await this._downloadDnaRemote((source as T.DnaUrl).url)
          dna["path"] = remotePath
        } else if (source.constructor.name == 'String') {
          if (this._saveDnaRemote !== undefined) {
            const path = source as T.DnaPath
            const contents = () => fs.promises.readFile(path)
            const pathAfterReplacement = path.replace(/\//g, '')
            const { path: remotePath } = await this._saveDnaRemote(pathAfterReplacement, contents)
            dna["path"] = remotePath
          } else {
            dna["path"] = source
          }
        } else if (source.constructor.name === 'Buffer') {
          dna["hash"] = source
        }
        return dna
      }))
    }
    return await this._installHapp(installAppReq)
  }

  // install a hApp using the InstallAppRequest struct from conductor-admin-api
  // you must create your own app_id and dnas list, this is useful also if you
  // need to pass in properties or membrane-proof
  _installHapp = async (installAppReq: InstallAppRequest): Promise<T.InstalledHapp> => {
    const { cell_data } = await this.adminClient!.installApp(installAppReq)
    // must be activated to be callable
    await this.adminClient!.activateApp({ installed_app_id: installAppReq.installed_app_id })

    // prepare the result, and create Cell instances
    const installedAgentHapp: T.InstalledHapp = {
      hAppId: installAppReq.installed_app_id,
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
    if (this.adminClient === null) {
      const adminWsUrl = `ws://${this._machineHost}:${this._adminInterfacePort}`
      this.adminClient = await AdminWebsocket.connect(adminWsUrl)
      this.logger.debug(`connectInterfaces :: connected admin interface at ${adminWsUrl}`)
    }

    // 0 in this case means use any open port
    const { port: appInterfacePort } = await this.adminClient.attachAppInterface({ port: 0 })

    if (this._appInterfaceCall === undefined) {
      const appWsUrl = `ws://${this._machineHost}:${appInterfacePort}`
      this.appClient = await AppWebsocket.connect(appWsUrl, this._timeout, (signal) => {
        this._onActivity();
        this.onSignal(signal);
      })
      this.logger.debug(`connectInterfaces :: connected app interface at ${appWsUrl}`)
    } else {
      this.appClient = new TunneledAppClient(async (message) => {
        const res = await this._appInterfaceCall!(appInterfacePort, message)
        this._onActivity()
        return res
      })
    }
  }
}
