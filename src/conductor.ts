import { ConductorConfig } from "./types";
import { notImplemented } from "./common";
import logger from "./logger";


/**
 * Representation of a running Conductor instance.
 * An [Actor] spawns a conductor process and uses the process handle to construct this class. 
 * Though Conductor is spawned externally, this class is responsible for establishing WebSocket
 * connections to the various interfaces to enable zome calls as well as admin and signal handling.
 */
export class Conductor {

  _config: ConductorConfig
  _hcConnect: any
  _isInitialized: boolean

  constructor() {
    this._hcConnect = require('@holochain/hc-web-client').connect
    this._isInitialized = false
    // this._config = config
  }

  initialize = async () => {
    throw notImplemented
    // await this._makeConnections()
  }

  callAdmin = (...a) => {
    throw notImplemented
  }

  callZome = (...a) => {
    throw notImplemented
  }

  // _makeConnections = async ({instances}: ConductorConfig) => {
  //   logger.debug("makeConnections :: connectTest")
  //   await this._connectTest()
  //   logger.debug("makeConnections :: connectSignals")
  //   await this._connectSignals()
  // }

  // _connectTest = async () => {
  //   if (!this.testPort) {
  //     throw new Error(`Attempting to connect to test interface with invalid port: ${this.testPort}`)
  //   }
  //   const url = this.testInterfaceUrl()
  //   logger.debug(`connectTest :: connecting to ${url}`)
  //   const { callZome } = await this.webClientConnect({url})
  //   this.callZome = (...args) => params => new Promise((resolve, reject) => {
  //     logger.debug(`${colors.cyan.bold("zome call [%s]:")} ${colors.cyan.underline("{id: %s, zome: %s, fn: %s}")}`, this.name, args[0], args[1], args[2])
  //     logger.debug(`${colors.cyan.bold("params:")} ${colors.cyan.underline("%s")}`, JSON.stringify(params, null, 2))
  //     const timeout = this.zomeCallTimeout
  //     const timer = setTimeout(() => reject(`zome call timed out after ${timeout / 1000} seconds: ${args.join('/')}`), timeout)
  //     const promise = callZome(...args)(params).then(result => {
  //       clearTimeout(timer)
  //       logger.debug(colors.cyan.bold('->'), JSON.parse(result))
  //       resolve(result)
  //     })
  //   })
  // }

  // connectSignals = async () => {
  //   const url = this.testInterfaceUrl()
  //   const { onSignal } = await this.webClientConnect({url})

  //   onSignal((msg: {signal, instance_id: string}) => {
  //     const instances = Object.keys(this.instanceMap).map(key => this.instanceMap[key])
  //     const instance = instances.find(instance => instance.id == msg.instance_id)
  //     if(instance) {
  //       instance.signals.push(msg.signal)
  //     }
  //   })
  // }

}