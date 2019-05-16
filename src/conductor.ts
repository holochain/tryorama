const child_process = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const colors = require('colors/safe')

import {promiseSerial} from './util'
import {InstanceConfig} from './config'

/// //////////////////////////////////////////////////////////

// these should be already set when the conductor is started by `hc test`
const ADMIN_INTERFACE_PORT = 5555
const ADMIN_INTERFACE_URL = `ws://localhost:${ADMIN_INTERFACE_PORT}`
const ADMIN_INTERFACE_ID = 'admin-interface'

const TEST_INTERFACE_PORT = 5556
const TEST_INTERFACE_URL = `ws://localhost:${TEST_INTERFACE_PORT}`
const TEST_INTERFACE_ID = 'test-interface'

/**
 * Represents a conductor process to which calls can be made via RPC
 *
 * @class      Conductor (name)
 */
export class Conductor {

  runningInstances: Array<string>
  webClientConnect: any
  agentIds: Set<string>
  dnaIds: Set<string>
  opts: any
  callAdmin: any
  callZome: any
  handle: any

  isInitialized: boolean

  constructor (connect, opts = {}) {
    this.webClientConnect = connect
    this.agentIds = new Set()
    this.dnaIds = new Set()
    this.opts = {}
    this.handle = null
    this.runningInstances = []
  }

  isRunning = () => {
    return this.runningInstances.length > 0
  }

  connect = async () => {
    const { call } = await this.webClientConnect(ADMIN_INTERFACE_URL)
    const { callZome, onSignal } = await this.webClientConnect(TEST_INTERFACE_URL)
    this.callAdmin = method => params => {
      console.debug(colors.yellow.underline("calling"), method)
      console.debug(params)
      return call(method)(params)
    }
    this.callZome = (...args) => async params => {
      console.debug(colors.cyan.underline("calling"), ...args)
      console.debug(params)
      const result = await callZome(...args)(params)
      console.debug('->', result)
      return result
    }
    onSignal(sig => {
      console.log(colors.magenta('got a sig:'), sig)
    })
  }

  initialize = async () => {
    if (!this.isInitialized) {
      try {
        await this.spawn()
        console.info(colors.inverse("test conductor spawned"))
        await this.connect()
        console.info(colors.inverse("test conductor connected"))
      } catch (e) {
        console.error("Error when initializing!")
        console.error(e)
        this.kill()
      }
      this.isInitialized = true
    }
  }

  /**
   * Calls the conductor RPC functions to initialize it according to the instances
   */
  setupInstances = async (instanceConfigs) => {
    if (this.isRunning()) {
      throw "Attempting to run a new test while another test has not yet been torn down"
    }
    for (const instance of instanceConfigs) {
      if (!this.agentIds.has(instance.agent.id)) {
        const addAgentResponse = await this.callAdmin('test/agent/add')(instance.agent)
        console.log('addAgentResponse', addAgentResponse)
        this.agentIds.add(instance.agent.id)
      }
      if (!this.dnaIds.has(instance.dna.id)) {
        const installDnaResponse = await this.callAdmin('admin/dna/install_from_file')(instance.dna)
        console.log('installDnaResponse', installDnaResponse)
        this.dnaIds.add(instance.dna.id)
      }
      await this.callAdmin('admin/instance/add')({
        id: instance.id,
        agent_id: instance.agent.id,
        dna_id: instance.dna.id,
      })
      await this.callAdmin('admin/instance/start')(instance)
      await this.callAdmin('admin/interface/add_instance')({
        interface_id: TEST_INTERFACE_ID,
        instance_id: instance.id
      })
      this.runningInstances.push(instance.id)
    }
  }

  teardownInstances = () => {
    if (!this.isRunning()) {
      throw "Attempting teardown, but there is nothing to tear down"
    }
    const promises = this.runningInstances.map(async instanceId => {
      await this.callAdmin('admin/interface/remove_instance')({
        interface_id: TEST_INTERFACE_ID,
        instance_id: instanceId,
      })
      await this.callAdmin('admin/instance/remove')({
        id: instanceId
      })
    })
    return Promise.all(promises).then(() => this.runningInstances = [])
  }

  run = async (instanceConfigs, fn) => {
    if (!this.isInitialized) {
      throw "Cannot run uninitialized conductor"
    }
    await this.setupInstances(instanceConfigs)
    await fn()
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

[[interfaces]]
id = "${TEST_INTERFACE_ID}"
instances = []
  [interfaces.driver]
  type = "websocket"
  port = ${TEST_INTERFACE_PORT}

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
