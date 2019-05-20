const child_process = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const getPort = require('get-port')

const colors = require('colors/safe')

import {promiseSerial} from './util'
import {InstanceConfig} from './config'

/// //////////////////////////////////////////////////////////

// these should be already set when the conductor is started by `hc test`
const ADMIN_INTERFACE_PORT = 5550
const ADMIN_INTERFACE_URL = `ws://localhost:${ADMIN_INTERFACE_PORT}`
const ADMIN_INTERFACE_ID = 'admin-interface'



export class DnaInstance {

  id: string
  agentAddress: string | null
  dnaAddress: string | null
  conductor: any

  constructor (instanceId, conductor: Conductor) {
    this.id = instanceId
    this.agentAddress = null
    this.dnaAddress = null
    this.conductor = conductor
  }

  // internally calls `this.conductor.call`
  async call (zome, fn, params) {
    try {
      const result = await this.conductor.callZome(this.id, zome, fn)(params)
      console.info(colors.blue.inverse("zome call"), this.id, zome, fn, params)
      return JSON.parse(result)
    } catch (e) {
      console.error('Exception occurred while calling zome function: ', e)
      throw e
    }
  }
}


/**
 * Represents a conductor process to which calls can be made via RPC
 *
 * @class      Conductor (name)
 */
export class Conductor {

  webClientConnect: any
  agentIds: Set<string>
  dnaIds: Set<string>
  instanceMap: any
  opts: any
  callAdmin: any
  handle: any

  runningInstances: Array<string>
  callZome: any
  testPort: number

  isInitialized: boolean

  constructor (connect, opts = {}) {
    this.webClientConnect = connect
    this.agentIds = new Set()
    this.dnaIds = new Set()
    this.instanceMap = {}
    this.opts = {}
    this.handle = null
    this.runningInstances = []
  }

  isRunning = () => {
    return this.runningInstances.length > 0
  }

  testInterfaceUrl = () => `ws://localhost:${this.testPort}`
  testInterfaceId = () => `test-interface-${this.testPort}`

  connectAdmin = async () => {
    const { call, onSignal } = await this.webClientConnect(ADMIN_INTERFACE_URL)
    this.callAdmin = method => async params => {
      console.debug(colors.yellow.underline("calling"), method)
      console.debug(params)
      const result = await call(method)(params)
      console.debug(colors.yellow.bold('->'), result)
      return result
    }
    onSignal(sig => {
      // if (sig.action.action_type !== 'InitializeChain') {
      //   console.log(colors.magenta('got a sig:'))
      //   console.log(JSON.stringify(sig, null, 2))
      // }
    })
  }

  connectTest = async () => {
    const url = this.testInterfaceUrl()
    const { callZome } = await this.webClientConnect(url)
    this.callZome = (...args) => async params => {
      console.debug(colors.cyan.underline("calling"), ...args)
      console.debug(params)
      const result = await callZome(...args)(params)
      // console.debug(colors.cyan.bold('->'), result)
      return result
    }
  }

  initialize = async () => {
    if (!this.isInitialized) {
      try {
        await this.spawn()
        console.info(colors.green.bold("test conductor spawned"))
        await this.connectAdmin()
        console.info(colors.green.bold("test conductor connected to admin interface"))
      } catch (e) {
        console.error("Error when initializing!")
        console.error(e)
        this.kill()
      }
      this.isInitialized = true
    }
  }

  getInterfacePort = async () => {
    const port = await getPort()
    // const port = await getPort({port: getPort.makeRange(5555, 5999)})
    console.log("using port", port)
    return port
  }

  setupNewInterface = async () => {
    this.testPort = await this.getInterfacePort()
    await this.callAdmin('admin/interface/add')({
      id: this.testInterfaceId(),
      admin: false,
      type: 'websocket',
      port: this.testPort,
    })
  }

  /**
   * Calls the conductor RPC functions to initialize it according to the instances
   */
  setupInstances = async (instanceConfigs) => {
    if (this.isRunning()) {
      throw "Attempting to run a new test while another test has not yet been torn down"
    }
    for (const instance of instanceConfigs) {
      if (!this.instanceMap[instance.id]) {
        this.instanceMap[instance.id] = new DnaInstance(instance.id, this)
      }
      if (!this.agentIds.has(instance.agent.id)) {
        const addAgentResponse = await this.callAdmin('test/agent/add')(instance.agent)
        console.log('addAgentResponse', addAgentResponse)
        const agentAddress = addAgentResponse.agent_address
        this.agentIds.add(instance.agent.id)
        this.instanceMap[instance.id].agentAddress = agentAddress
      }
      if (!this.dnaIds.has(instance.dna.id)) {
        const installDnaResponse = await this.callAdmin('admin/dna/install_from_file')(instance.dna)
        console.log('installDnaResponse', installDnaResponse)
        const dnaAddress = installDnaResponse.dna_hash
        this.dnaIds.add(instance.dna.id)
        this.instanceMap[instance.id].dnaAddress = dnaAddress
      }
      await this.callAdmin('admin/instance/add')({
        id: instance.id,
        agent_id: instance.agent.id,
        dna_id: instance.dna.id,
      })
      await this.callAdmin('admin/instance/start')(instance)
      await this.callAdmin('admin/interface/add_instance')({
        interface_id: this.testInterfaceId(),  // NB: this changes between tests
        instance_id: instance.id
      })
      this.runningInstances.push(instance.id)
    }
  }

  teardownInstances = async () => {
    if (!this.isRunning()) {
      throw "Attempting teardown, but there is nothing to tear down"
    }
    for (const instanceId of this.runningInstances) {
      await this.callAdmin('admin/interface/remove_instance')({
        interface_id: this.testInterfaceId(),  // NB: this changes between tests
        instance_id: instanceId,
      })
      await this.callAdmin('admin/instance/remove')({
        id: instanceId
      })
    }
    this.runningInstances = []
  }

  run = async (instanceConfigs, fn) => {
    if (!this.isInitialized) {
      throw "Cannot run uninitialized conductor"
    }
    await this.setupNewInterface()
    await this.connectTest()
    await this.setupInstances(instanceConfigs)
    console.debug("Instances all set up, running test...")
    await fn(this.instanceMap)
    console.debug("Test done, tearing down instances...")
    await this.teardownInstances()
  }

  spawn () {
    const tmpPath = fs.mkdtempSync(path.join(os.tmpdir(), 'hc-playbook-'))
    const configPath = path.join(tmpPath, 'conductor-config.toml')
    const persistencePath = tmpPath
    const config = this.initialConfig(persistencePath, this.opts)
    fs.writeFileSync(configPath, config)
    console.info("Using config file at", configPath)
    const handle = child_process.spawn(`holochain`, ['-c', configPath])

    handle.stdout.on('data', data => {
      const line = data.toString('utf8')
      console.log(`[C]`, line)
    })
    handle.stderr.on('data', data => console.error(`!C!`, data.toString('utf8')))
    handle.on('close', code => console.log(`conductor exited with code`, code))
    this.handle = handle
  }

  kill () {
    this.handle.kill()
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
  port = ${ADMIN_INTERFACE_PORT}

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
  exclude = true
  pattern = ".*"
    `
  }
}
