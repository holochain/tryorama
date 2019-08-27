const colors = require('colors/safe')
import { Signal } from '@holochain/hachiko'

import { ConductorConfig, Mortal, GenConfigArgs } from "./types";
import { notImplemented } from "./common";
import logger from "./logger";


const DEFAULT_ZOME_CALL_TIMEOUT = 60000

/**
 * Representation of a running Conductor instance.
 * An [Actor] spawns a conductor process and uses the process handle to construct this class. 
 * Though Conductor is spawned externally, this class is responsible for establishing WebSocket
 * connections to the various interfaces to enable zome calls as well as admin and signal handling.
 */
export class Conductor {

  name: string
  onSignal: (Signal) => void
  zomeCallTimeout: number

  _genConfigArgs: GenConfigArgs
  _handle: Mortal
  _hcConnect: any
  _isInitialized: boolean

  constructor({ name, handle, onSignal, adminPort, zomePort }) {
    this.name = name
    this.onSignal = onSignal
    this.zomeCallTimeout = DEFAULT_ZOME_CALL_TIMEOUT

    this._genConfigArgs = { adminPort, zomePort, configDir: 'UNUSED' }
    this._handle = handle
    this._hcConnect = require('@holochain/hc-web-client').connect
    this._isInitialized = false
  }

  callAdmin: Function = (...a) => {
    throw notImplemented
  }

  callZome: Function = (...a) => {
    throw notImplemented
  }

  initialize = async () => {
    await this._makeConnections()
  }

  kill = () => {
    this._handle.kill()
  }

  _makeConnections = async () => {
    await this._connectAdmin()
    await this._connectZome()
  }

  _connectAdmin = async () => {

    const url = this._adminInterfaceUrl()
    logger.debug(`connectTest :: connecting to ${url}`)
    const { call, callZome, onSignal } = await this._hcConnect({ url })

    this.callAdmin = method => async params => {
      logger.debug(`${colors.yellow.bold("[setup call on %s]:")} ${colors.yellow.underline("%s")}`, this.name, method)
      logger.debug(JSON.stringify(params, null, 2))
      const result = await call(method)(params)
      logger.debug(`${colors.yellow.bold('-> %o')}`, result)
      return result
    }

    onSignal(({ signal, instance_id }) => {
      if (signal.signal_type !== 'Consistency') {
        return
      }

      this.onSignal({
        conductorName: this.name,
        instanceId: instance_id,
        signal
      })
    })
  }

  _connectZome = async () => {
    const url = this._zomeInterfaceUrl()
    logger.debug(`connectTest :: connecting to ${url}`)
    const { call, callZome, onSignal } = await this._hcConnect({ url })

    this.callZome = (instanceId, zomeName, fnName, params) => new Promise((resolve, reject) => {
      logger.debug(`${colors.cyan.bold("zome call [%s]:")} ${colors.cyan.underline("{id: %s, zome: %s, fn: %s}")}`,
        this.name, instanceId, zomeName, fnName
      )
      logger.debug(`${colors.cyan.bold("params:")} ${colors.cyan.underline("%s")}`, JSON.stringify(params, null, 2))
      const timeout = this.zomeCallTimeout
      const timer = setTimeout(
        () => reject(`zome call timed out after ${timeout / 1000} seconds: ${instanceId}/${zomeName}/${fnName}`),
        timeout
      )
      const promise = callZome(instanceId, zomeName, fnName)(params).then(result => {
        clearTimeout(timer)
        logger.debug(colors.cyan.bold('->'), JSON.parse(result))
        resolve(result)
      })
      return promise
    })
  }

  _adminInterfaceUrl = () => `ws://localhost:${this._genConfigArgs.adminPort}`
  _zomeInterfaceUrl = () => `ws://localhost:${this._genConfigArgs.zomePort}`
}