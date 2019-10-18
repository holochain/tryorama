const colors = require('colors/safe')
const hcWebClient = require('@holochain/hc-web-client')

import { Signal } from '@holochain/hachiko'
import { ConductorConfig, Mortal, GenConfigArgs } from "./types";
import { notImplemented } from "./common";
import { makeLogger } from "./logger";
import { delay } from './util';
import env from './env';


const DEFAULT_ZOME_CALL_TIMEOUT = 90000
const DEFAULT_CONDUCTOR_ACTIVITY_TIMEOUT = 120000
// probably unnecessary, but it can't hurt
const WS_CLOSE_DELAY_FUDGE = 1000

/**
 * Representation of a running Conductor instance.
 * A [Player] spawns a conductor process and uses the process handle to construct this class. 
 * Though Conductor is spawned externally, this class is responsible for establishing WebSocket
 * connections to the various interfaces to enable zome calls as well as admin and signal handling.
 */
export class Conductor {

  name: string
  onSignal: ({ instanceId: string, signal: Signal }) => void
  zomeCallTimeoutMs: number
  conductorTimeoutMs: number
  logger: any

  _ports: { adminPort: number, zomePort: number }
  _handle: Mortal
  _hcConnect: any
  _isInitialized: boolean
  _wsClosePromise: Promise<void>
  _conductorTimer: any

  constructor({ name, handle, onSignal, adminPort, zomePort }) {
    this.name = name
    this.logger = makeLogger(`try-o-rama conductor ${name}`)
    this.logger.debug("Conductor constructing")
    this.onSignal = onSignal
    this.zomeCallTimeoutMs = DEFAULT_ZOME_CALL_TIMEOUT
    this.conductorTimeoutMs = DEFAULT_CONDUCTOR_ACTIVITY_TIMEOUT

    this._ports = { adminPort, zomePort }
    this._handle = handle
    this._hcConnect = hcWebClient.connect
    this._isInitialized = false
    this._wsClosePromise = Promise.resolve()
    this._conductorTimer = null
  }

  callAdmin: Function = (...a) => {
    // Not supporting admin functions because currently adding DNAs, instances, etc.
    // is undefined behavior, since the Waiter needs to know about all DNAs in existence,
    // and it's too much of a pain to track all of that with mutable conductor config.
    // If admin functions are added, then a hook must be added as well to update Waiter's
    // NetworkModels as new DNAs and instances are added/removed.
    throw new Error("Admin functions are currently not supported.")
  }

  callZome: Function = (...a) => {
    throw new Error("Attempting to call zome function before conductor was initialized")
  }

  initialize = async () => {
    this._restartTimer()
    await this._makeConnections()
  }

  kill = (signal?): Promise<void> => {
    this.logger.debug("Killing...")
    this._handle.kill(signal)
    return this._wsClosePromise
  }

  wsClosed = () => this._wsClosePromise

  _makeConnections = async () => {
    await this._connectAdmin()
    await this._connectZome()
  }

  _connectAdmin = async () => {
    this._restartTimer()
    const url = this._adminInterfaceUrl()
    this.logger.debug(`connectAdmin :: connecting to ${url}`)
    const { call, onSignal, ws } = await this._hcConnect({ url })

    this._wsClosePromise = (
      // Wait for a constant delay and for websocket to close, whichever happens *last*
      Promise.all([
        new Promise(resolve => ws.on('close', resolve)),
        delay(WS_CLOSE_DELAY_FUDGE),
      ]).then(() => {
        this._clearTimer()
      })
    )

    this.callAdmin = async (method, params) => {
      this._restartTimer()
      if (!method.match(/^admin\/.*\/list$/)) {
        this.logger.warn("Calling admin functions which modify state during tests may result in unexpected behavior!")
      }
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
        instanceId: instance_id,
        signal
      })
    })
  }

  _clearTimer = () => {
    clearTimeout(this._conductorTimer)
    this._conductorTimer = null
  }

  _restartTimer = () => {
    clearTimeout(this._conductorTimer)
    this._conductorTimer = setTimeout(() => this._onConductorTimeout(), this.conductorTimeoutMs)
  }

  _onConductorTimeout = () => {
    this.kill('SIGKILL')
    const msg = `Conductor '${this.name}' self-destructed after ${this.conductorTimeoutMs / 1000} seconds of no activity!`
    if (env.strictConductorTimeout) {
      throw new Error(msg)
    } else {
      this.logger.error(msg)
    }
  }

  _connectZome = async () => {
    this._restartTimer()
    const url = this._zomeInterfaceUrl()
    this.logger.debug(`connectZome :: connecting to ${url}`)
    const { callZome, onSignal } = await this._hcConnect({ url })

    this.callZome = (instanceId, zomeName, fnName, params) => new Promise((resolve, reject) => {
      this._restartTimer()
      this.logger.debug(`${colors.cyan.bold("zome call [%s]:")} ${colors.cyan.underline("{id: %s, zome: %s, fn: %s}")}`,
        this.name, instanceId, zomeName, fnName
      )
      this.logger.debug(`${colors.cyan.bold("params:")} ${colors.cyan.underline("%s")}`, JSON.stringify(params, null, 2))
      const timeoutSoft = this.zomeCallTimeoutMs / 2
      const timeoutHard = this.zomeCallTimeoutMs
      const timerSoft = setTimeout(
        () => this.logger.warn(`Zome call has been running for more than ${timeoutSoft / 1000} seconds. Continuing to wait...`),
        timeoutSoft
      )
      const timerHard = setTimeout(
        () => {
          const msg = `zome call timed out after ${timeoutHard / 1000} seconds on conductor '${this.name}': ${instanceId}/${zomeName}/${fnName}`
          if (env.stateDumpOnError) {
            this.callAdmin('debug/state_dump', { instance_id: instanceId }).then(dump => {
              this.logger.error("STATE DUMP:")
              this.logger.error(JSON.stringify(dump, null, 2))
            }).catch(err => this.logger.error("Error while calling debug/state_dump: %o", err))
              .then(() => reject(msg))
          } else {
            reject(msg)
          }
        },
        timeoutHard
      )
      callZome(instanceId, zomeName, fnName)(params).then(json => {
        clearTimeout(timerSoft)
        clearTimeout(timerHard)
        this._restartTimer()
        const result = JSON.parse(json)
        this.logger.debug(`${colors.cyan.bold('->')} %o`, result)
        resolve(result)
      }).catch(reject)
    })
  }

  _adminInterfaceUrl = () => `ws://localhost:${this._ports.adminPort}`
  _zomeInterfaceUrl = () => `ws://localhost:${this._ports.zomePort}`
}