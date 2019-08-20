import { ConductorConfig } from "./types";



export class Conductor {

  _config: ConductorConfig
  _hcConnect: any
  _isInitialized: boolean

  callZome = () => {

  }

  constructor(config: ConductorConfig) {
    this._hcConnect = require('@holochain/hc-web-client').connect
    this._isInitialized = false
    this._config = config
  }


  // async makeConnections ({instances}: T.ConductorConfig) {
  //   logger.debug("makeConnections :: connectTest")
  //   await this.connectTest()
  //   logger.debug("makeConnections :: connectSignals")
  //   await this.connectSignals()
  // }

  // connectTest = async () => {
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