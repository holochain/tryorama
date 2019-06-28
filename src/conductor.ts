const child_process = require('child_process')
const del = require('del')
const fs = require('fs')
const os = require('os')
const path = require('path')
const getPort = require('get-port')

const colors = require('colors/safe')

const _ = require('lodash')

import {Signal} from '@holochain/hachiko'
import {promiseSerial, delay} from './util'
import * as T from './types'
import {DnaInstance} from './instance'
import logger from './logger'

/// //////////////////////////////////////////////////////////

// these should be already set when the conductor is started by `hc test`
const wsUrl = port => `ws://localhost:${port}`
const ADMIN_INTERFACE_ID = 'admin-interface'

const DEFAULT_ZOME_CALL_TIMEOUT = 60000

type ConductorOpts = {
  onSignal: (Signal) => void,
  debugLog: boolean,
  zomeCallTimeout?: number,
}

const storagePath = () => process.env.DIORAMA_STORAGE || fs.mkdtempSync(path.join(os.tmpdir(), 'hc-diorama-'))

/**
 * Represents a conductor process to which calls can be made via RPC
 *
 * @class      Conductor (name)
 */
export class Conductor {

  webClientConnect: any
  agentIds: Set<string>
  dnaIds: Set<string>
  instanceMap: {[name: string]: DnaInstance}
  opts: any
  name: string
  externalUrl: string
  handle: any
  dnaNonce: number
  onSignal: (any) => void

  runningInstances: Array<T.InstanceConfig>
  callZome: any
  testPort: number
  adminPort: number

  isInitialized: boolean

  constructor (connect, externalConductor: T.ExternalConductor, opts: ConductorOpts) {
    this.webClientConnect = connect
    this.agentIds = new Set()
    this.dnaIds = new Set()
    this.instanceMap = {}
    this.opts = opts
    this.handle = null
    this.runningInstances = []
    this.dnaNonce = 1
    this.onSignal = opts.onSignal
    this.name = externalConductor.name
    this.externalUrl = externalConductor.url
    logger.info("externalConductor: %j", externalConductor)
  }

  initialize = async (): Promise<void> => {
    if (!this.isInitialized) {
      await this.connectAdmin(this.externalUrl)
      this.isInitialized = true
    }
    return Promise.resolve()
  }

  isRunning = () => {
    return this.runningInstances.length > 0
  }

  testInterfaceUrl = () => `ws://localhost:${this.testPort}`
  testInterfaceId = () => `test-interface-${this.testPort}`

  connectAdmin = async (url) => {
    logger.info("Trying to connect to conductor: %s", url)
    const { call, onSignal } = await this.webClientConnect({url})
    logger.info("Connected.")
    this.callAdmin = method => async params => {
      logger.debug(`${colors.yellow.bold("[setup call on %s]:")} ${colors.yellow.underline("%s")}`, this.name, method)
      logger.debug(JSON.stringify(params, null, 2))
      const result = await call(method)(params)
      logger.debug(`${colors.yellow.bold('-> %j')}`, result)
      return result
    }

    onSignal(({signal, instance_id}) => {
      if (signal.signal_type !== 'Consistency') {
        return
      }

      // take off the nonced suffix
      // XXX, NB, this '-' magic is because of the nonced instance IDs
      // TODO: deal with this more reasonably
      const ix = instance_id.lastIndexOf('-')
      const instanceId = instance_id.substring(0, ix)

      this.onSignal({
        conductorName: this.name,
        instanceId: instanceId,
        signal
      })
    })
  }

  callAdmin: ((string) => (any) => Promise<any>) = method => async params => {
    throw new Error("callAdmin not set up yet! This is because hc-web-client has not yet established a websocket connection.")
  }

  connectTest = async () => {
    const url = this.testInterfaceUrl()
    const { callZome } = await this.webClientConnect({url})
    this.callZome = (...args) => params => new Promise((resolve, reject) => {
      logger.debug(`${colors.cyan.bold("zome call [%s]:")} ${colors.cyan.underline("{id: %s, zome: %s, fn: %s}")}`, this.name, args[0], args[1], args[2])
      logger.debug(`${colors.cyan.bold("params:")} ${colors.cyan.underline("%s")}`, JSON.stringify(params, null, 2))
      const timeout = this.opts.zomeCallTimeout || DEFAULT_ZOME_CALL_TIMEOUT
      const timer = setTimeout(() => reject(`zome call timed out after ${timeout / 1000} seconds: ${args.join('/')}`), timeout)
      const promise = callZome(...args)(params).then(result => {
        clearTimeout(timer)
        logger.debug(colors.cyan.bold('->'), JSON.parse(result))
        resolve(result)
      })
    })
  }

  connectSignals = async () => {
    const url = this.testInterfaceUrl()
    const { onSignal } = await this.webClientConnect({url})

    onSignal((msg: {signal, instance_id: string}) => {
      const instances = Object.keys(this.instanceMap).map(key => this.instanceMap[key])
      const instance = instances.find(instance => instance.id == msg.instance_id)
      if(instance) {
        instance.signals.push(msg.signal)
      }
    })
  }

  getInterfacePort = async () => {
    const port = await getPort()
    // const port = await getPort({port: getPort.makeRange(5555, 5999)})
    logger.info("using port, %n", port)
    return port
  }

  setupNewInterface = async () => {
    console.debug("setupNewInterface :: getInterfacePort")
    this.testPort = await this.getInterfacePort()
    console.debug("setupNewInterface :: callAdmin")
    await this.callAdmin('admin/interface/add')({
      id: this.testInterfaceId(),
      admin: false,
      type: 'websocket',
      port: this.testPort,
    })
  }


  setupDna = async (nonNoncifiedInstanceId, instanceConfig) => {
    const dnaConfig = JSON.parse(JSON.stringify(instanceConfig.dna))  // poor man's deep clone
    dnaConfig.id += '-' + this.dnaNonce
    dnaConfig.copy = true
    dnaConfig.uuid = `${dnaConfig.uuid || 'uuid'}-${this.dnaNonce}`

    if (!this.dnaIds.has(dnaConfig.id)) {
      const installDnaResponse = await this.callAdmin('admin/dna/install_from_file')(dnaConfig)
      logger.silly('installDnaResponse: %j', installDnaResponse)
      const dnaAddress = installDnaResponse.dna_hash
      this.dnaIds.add(dnaConfig.id)
      this.instanceMap[nonNoncifiedInstanceId].dnaAddress = dnaAddress
    }
    return dnaConfig
  }


  /**
   * Calls the conductor RPC functions to initialize it according to the instances
   */
  setupInstances = async (instanceConfigs: Array<T.InstanceConfig>) => {
    if (this.isRunning()) {
      throw "Attempting to run a new test while another test has not yet been torn down"
    }
    for (const instanceConfig of instanceConfigs) {
      const instance = _.cloneDeep(instanceConfig)
      const nonNoncifiedInstanceId = instance.id
      instance.id += '-' + this.dnaNonce
      if (this.instanceMap[nonNoncifiedInstanceId]) {
        const inst = new DnaInstance(instance.id, this.callZome)
        inst.agentAddress = this.instanceMap[nonNoncifiedInstanceId].agentAddress
        this.instanceMap[nonNoncifiedInstanceId] = inst
      } else {
        this.instanceMap[nonNoncifiedInstanceId] = new DnaInstance(instance.id, this.callZome)
      }
      if (!this.agentIds.has(instance.agent.id)) {
        const addAgentResponse = await this.callAdmin('test/agent/add')(instance.agent)
        logger.silly('addAgentResponse: %j', addAgentResponse)
        const agentAddress = addAgentResponse.agent_address
        this.agentIds.add(instance.agent.id)
        this.instanceMap[nonNoncifiedInstanceId].agentAddress = agentAddress
      }
      instance.dna = await this.setupDna(nonNoncifiedInstanceId, instance)
      await this.callAdmin('admin/instance/add')({
        id: instance.id,
        agent_id: instance.agent.id,
        dna_id: instance.dna.id,
      })
      await this.callAdmin('admin/interface/add_instance')({
        interface_id: this.testInterfaceId(),  // NB: this changes between tests
        instance_id: instance.id
      })
      this.runningInstances.push(instance)
    }
  }

  teardownInstances = async () => {
    if (!this.isRunning()) {
      throw "Attempting teardown, but there is nothing to tear down"
    }
    let dnaId: string | null = null
    for (const instance of this.runningInstances) {
      await this.callAdmin('admin/interface/remove_instance')({
        interface_id: this.testInterfaceId(),  // NB: this changes between tests
        instance_id: instance.id,
      })
      await this.callAdmin('admin/instance/remove')({
        id: instance.id
      })
      dnaId = instance.dna.id  // XXX TODO: should be the same every time
    }
    await this.callAdmin('admin/interface/remove')({
      id: this.testInterfaceId(),
    })
    await this.callAdmin('admin/dna/uninstall')({
      id: dnaId
    })
    this.runningInstances = []
  }

  cleanupStorage = async () => await del([
    path.join(storagePath(), 'storage'),
    path.join(storagePath(), 'dna'),
  ])


  noncifyBridgeConfig = (bridgeConfig) => {
    const bridge = JSON.parse(JSON.stringify(bridgeConfig))
    bridge.caller_id += '-' + this.dnaNonce
    bridge.callee_id += '-' + this.dnaNonce
    return bridge
  }

  setupBridges = async (bridgeConfigs: Array<T.BridgeConfig>) => {
    for (const bridgeConfig of bridgeConfigs) {
      await this.callAdmin('admin/bridge/add')(this.noncifyBridgeConfig(bridgeConfig))
    }
  }

  startInstances = async (instanceConfigs: Array<T.InstanceConfig>) => {
    for (const instanceConfig of instanceConfigs) {
      const instance = JSON.parse(JSON.stringify(instanceConfig))
      instance.id += '-' + this.dnaNonce
      await this.callAdmin('admin/instance/start')(instance)
    }
  }

  teardownBridges = async (bridgeConfigs: Array<T.BridgeConfig>) => {
    for (const bridgeConfig of bridgeConfigs) {
      await this.callAdmin('admin/bridge/remove')(this.noncifyBridgeConfig(bridgeConfig))
    }
  }

  prepareRun = async ({instances, bridges}: T.ConductorConfig) => {
    logger.debug(colors.yellow.bold("---------------------------------------------------------"))
    logger.debug(colors.yellow.bold(`-------  preparing ${this.name}`))
    logger.debug('')
    if (!this.isInitialized) {
      throw "Cannot run uninitialized conductor"
    }
    try {
      logger.debug("prepareRun :: setupNewInterface")
      await this.setupNewInterface()
      logger.debug("prepareRun :: connectTest")
      await this.connectTest()
      logger.debug("prepareRun :: setupInstances")
      await this.setupInstances(instances)
      logger.debug("prepareRun :: setupBridges")
      await this.setupBridges(bridges)
      logger.debug("prepareRun :: startInstances")
      await this.startInstances(instances)
      logger.debug("prepareRun :: connectSignals")
      await this.connectSignals()
    } catch (e) {
      this.abort(e)
    }
    logger.debug(colors.yellow.bold(`-------  done preparing ${this.name}`))
  }

  cleanupRun = async ({bridges}: T.ConductorConfig) => {
    logger.debug(colors.yellow.bold(`-------  cleaning up ${this.name}`))
    logger.debug('')
    try {
      await this.teardownBridges(bridges)
      await this.teardownInstances()
      // await this.cleanupStorage()
    } catch (e) {
      this.abort(e)
    }
    logger.debug("Test done, tearing down instances...")
    logger.debug("Storage cleared...")
    logger.debug(colors.yellow.bold(`-------  done cleaning up ${this.name}`))
    logger.debug(colors.yellow.bold("---------------------------------------------------------"))
    this.dnaNonce += 1
  }

  spawn () {
    const tmpPath = storagePath()
    const configPath = path.join(tmpPath, 'conductor-config.toml')
    const persistencePath = tmpPath
    const config = this.initialConfig(persistencePath, this.opts)
    fs.writeFileSync(configPath, config)
    logger.info(`Using config file at ${configPath}`)
    try {
      const which = child_process.execSync('which holochain')
      logger.info(`Using holochain binary at ${which.toString('utf8')}`)
    } catch (e) {}

    const handle = child_process.spawn(`holochain`, ['-c', configPath])

    handle.stdout.on('data', data => {
      const line = data.toString('utf8')
      logger.info(`[C] %s`, line)
    })
    handle.stderr.on('data', data => logger.error(`!C! %s`, data.toString('utf8')))
    handle.on('close', code => logger.info(`conductor exited with code ${code}`))
    this.handle = handle
  }

  kill () {
    logger.info("TODO: kill?")
  }

  abort (msg) {
    logger.error(`Test conductor aborted: %j`, msg)
    this.kill()
    process.exit(-1)
  }

  failTest (e) {
    logger.error("Test failed while running: %j", e)
    throw e
  }

  initialConfig (persistencePath, opts) {
    return `
agents = []
dnas = []
instances = []
persistence_dir = "${persistencePath}"

[[interfaces]]
admin = true
id = "${ADMIN_INTERFACE_ID}"
instances = []
  [interfaces.driver]
  type = "websocket"
  port = ${this.adminPort}

[logger]
type = "debug"
  [[logger.rules.rules]]
  color = "red"
  exclude = false
  pattern = "^err/"
  [[logger.rules.rules]]
  color = "white"
  exclude = false
  pattern = "^debug/dna"
  [[logger.rules.rules]]
  exclude = ${opts.debugLog ? 'false' : 'true'}
  pattern = ".*"

[signals]
trace = false
consistency = true
    `
  }
}
