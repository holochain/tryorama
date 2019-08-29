const colors = require('colors/safe')
import { Signal } from '@holochain/hachiko'

import { ConductorConfig, Mortal, GenConfigArgs } from "./types";
import { notImplemented } from "./common";
import { makeLogger } from "./logger";


const DEFAULT_ZOME_CALL_TIMEOUT = 60000

/**
 * Representation of a running Conductor instance.
 * A [Player] spawns a conductor process and uses the process handle to construct this class. 
 * Though Conductor is spawned externally, this class is responsible for establishing WebSocket
 * connections to the various interfaces to enable zome calls as well as admin and signal handling.
 */
export class Conductor {

  name: string
  onSignal: (Signal) => void
  zomeCallTimeout: number
  logger: any

  _genConfigArgs: GenConfigArgs
  _handle: Mortal
  _hcConnect: any
  _isInitialized: boolean

  constructor({ name, handle, onSignal, adminPort, zomePort }) {
    this.name = name
    this.logger = makeLogger(`conductor ${name}`)
    this.logger.debug("Conductor constructing")
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

  kill = (signal?) => {
    this.logger.debug("Killing...")
    this._handle.kill(signal)
  }

  _makeConnections = async () => {
    await this._connectAdmin()
    await this._connectZome()
  }

  _connectAdmin = async () => {

    const url = this._adminInterfaceUrl()
    this.logger.debug(`connectAdmin :: connecting to ${url}`)
    const { call, onSignal } = await this._hcConnect({ url })

    this.callAdmin = method => async params => {
      this.logger.debug(`${colors.yellow.bold("[setup call on %s]:")} ${colors.yellow.underline("%s")}`, this.name, method)
      this.logger.debug(JSON.stringify(params, null, 2))
      const result = await call(method)(params)
      this.logger.debug(`${colors.yellow.bold('-> %o')}`, result)
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
    this.logger.debug(`connectZome :: connecting to ${url}`)
    const { callZome } = await this._hcConnect({ url })

    this.callZome = (instanceId, zomeName, fnName, params) => new Promise((resolve, reject) => {
      this.logger.debug(`${colors.cyan.bold("zome call [%s]:")} ${colors.cyan.underline("{id: %s, zome: %s, fn: %s}")}`,
        this.name, instanceId, zomeName, fnName
      )
      this.logger.debug(`${colors.cyan.bold("params:")} ${colors.cyan.underline("%s")}`, JSON.stringify(params, null, 2))
      const timeout = this.zomeCallTimeout
      const timer = setTimeout(
        () => reject(`zome call timed out after ${timeout / 1000} seconds: ${instanceId}/${zomeName}/${fnName}`),
        timeout
      )
      return callZome(instanceId, zomeName, fnName)(params).then(result => {
        clearTimeout(timer)
        this.logger.debug(colors.cyan.bold('->'), JSON.parse(result))
        resolve(result)
      }).catch(reject)
    })
  }

  _adminInterfaceUrl = () => `ws://localhost:${this._genConfigArgs.adminPort}`
  _zomeInterfaceUrl = () => `ws://localhost:${this._genConfigArgs.zomePort}`
}