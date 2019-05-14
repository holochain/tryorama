const child_process = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const colors = require('colors/safe')

/// //////////////////////////////////////////////////////////

// these should be already set when the conductor is started by `hc test`
const ADMIN_INTERFACE_PORT = 3334
const ADMIN_INTERFACE_URL = `ws://localhost:${ADMIN_INTERFACE_PORT}`
const ADMIN_INTERFACE_ID = 'admin-interface'

const TEST_INTERFACE_PORT = 3333
const TEST_INTERFACE_URL = `ws://localhost:${TEST_INTERFACE_PORT}`
const TEST_INTERFACE_ID = 'test-interface'

/**
 * Represents a conductor process to which calls can be made via RPC
 *
 * @class      Conductor (name)
 */
export class Conductor {

  instances: Array<any>
  webClientConnect: any
  agentIds: {[instanceId: string]: any}
  dnaAddresses: {[instanceId: string]: any}
  opts: any
  callAdmin: any
  callZome: any
  _handle: any

  constructor (instances, connect, opts = {}) {
    this.instances = instances
    this.webClientConnect = connect
    this.agentIds = {}
    this.dnaAddresses = {}
    this.opts = {}
    this._handle = null
  }

  async connect () {
    const { call } = await this.webClientConnect(ADMIN_INTERFACE_URL)
    const { callZome, onSignal } = await this.webClientConnect(TEST_INTERFACE_URL)
    this.callAdmin = method => {
      console.debug(colors.underline("calling"), method)
      return call(method)
    }
    this.callZome = callZome
    onSignal(sig => {
      console.log(colors.yellow('got a sig:'), sig)
    })
  }

  /**
   * Calls the conductor RPC functions to initialize it according to the instances
   */
  async initialize () {
    const call = this.callAdmin
    console.log('insts', this.instances)
    const promises = this.instances.map(async instance => {
      const installDnaResponse = await call('admin/dna/install_from_file')(instance.dna)
      console.log('installDnaResponse', installDnaResponse)
      const addAgentResponse = await call('test/agent/add')(instance.agent)
      console.log('addAgentResponse', addAgentResponse)

      await call('admin/instance/add')({
        id: instance.id,
        agent_id: instance.agent.id,
        dna_id: instance.dna.id,
      })
      await call('admin/instance/start')(instance)
      await call('admin/interface/add_instance')({ interface_id: TEST_INTERFACE_ID, instance_id: instance.id })

      this.agentIds[instance.id] = addAgentResponse.agentId
      this.dnaAddresses[instance.id] = installDnaResponse.dna_hash
    })
    return Promise.all(promises)
  }

  agentId (instanceId) {
    return this.agentIds[instanceId]
  }

  dnaAddress (instanceId) {
    return this.dnaAddresses[instanceId]
  }

  register_callback (callback) {
    throw new Error('Not Implemented')
  }

  async run (fn) {
    try {
      await this.spawn()
      console.info(colors.inverse("test conductor spawned"))
      await this.connect()
      console.info(colors.inverse("test conductor connected"))
      await this.initialize()
      console.info(colors.inverse("test conductor initialized"), this.instances.length, 'instance(s)')
    } catch (e) {
      console.error("Error when initializing!")
      console.error(e)
      this.kill()
    }
    await fn(() => this.kill())
    await this.kill()
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
    this._handle = handle
  }

  kill () {
    this._handle.kill()
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
