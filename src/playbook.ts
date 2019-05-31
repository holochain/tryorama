const tape = require('tape')
const colors = require('colors/safe')

import {connect} from '@holochain/hc-web-client'
import {Waiter, FullSyncNetwork, NodeId, Signal} from '@holochain/scenario-waiter'
import {InstanceConfig, BridgeConfig} from './types'
import {Conductor} from './conductor'
import {ScenarioApi} from './api'
import {simpleExecutor} from './executors'
import {identity} from './util'

/////////////////////////////////////////////////////////////

type PlaybookConstructorParams = {
  instances?: any,
  bridges?: Array<BridgeConfig>,
  middleware?: any,
  executor?: any,
  debugLog?: boolean,
}

export const PlaybookClass = Conductor => class Playbook {
  instanceConfigs: Array<InstanceConfig>
  bridgeConfigs: Array<BridgeConfig>
  conductor: Conductor
  scenarios: Array<any>
  middleware: any | void
  executor: any | void
  conductorOpts: any | void
  waiter: Waiter

  constructor ({bridges = [], instances = {}, middleware = identity, executor = simpleExecutor, debugLog = false}: PlaybookConstructorParams) {
    this.bridgeConfigs = bridges
    this.middleware = middleware
    this.executor = executor
    this.conductorOpts = {debugLog}

    this.scenarios = []
    this.instanceConfigs = []
    this.conductor = new Conductor(connect, {onSignal: this.onSignal.bind(this), ...this.conductorOpts})

    Object.entries(instances).forEach(([agentId, dnaConfig]) => {
      console.debug('agentId', agentId)
      console.debug('dnaConfig', dnaConfig)
      const instanceConfig = makeInstanceConfig(agentId, dnaConfig)
      const id = instanceConfig.id
      this.instanceConfigs.push(instanceConfig)
    })

    this.refreshWaiter()
  }

  onSignal (msg: {signal: Signal, instance_id: String}) {
    if (msg.signal.signal_type === 'Consistency') {
      // XXX, NB, this '-' magic is because of the nonced instance IDs
      // TODO: deal with this more reasonably
      const ix = msg.instance_id.lastIndexOf('-')
      const node = msg.instance_id.substring(0, ix)
      const signal = stringifySignal(msg.signal)
      this.waiter.handleObservation({node, signal})
    }
  }

  /**
   * More conveniently create config for a DNA
   */
  static dna = (path, id = `${path}`) => ({ path, id })

  /**
   * More conveniently create config for a bridge
   */
  static bridge = (handle, caller_id, callee_id) => ({handle, caller_id, callee_id})

  /**
   * origFn takes (s, instances)
   */
  registerScenario = (desc, scenario) => {
    const execute = () => this.executor(
      this.runScenario,
      scenario,
      desc
    )
    this.scenarios.push([desc, execute])
  }

  runScenario = async scenario => {
    await this.refreshWaiter()
    const modifiedScenario = this.middleware(scenario)
    return this.conductor.run(this.instanceConfigs, this.bridgeConfigs, (instanceMap) => {
      const api = new ScenarioApi(this.waiter)
      return modifiedScenario(api, instanceMap)
    })
  }

  refreshWaiter = () => new Promise(resolve => {
    if (this.waiter) {
      console.log("Test over, waiting for Waiter to flush...")
      this.waiter.registerCallback({nodes: null, callback: resolve})
    } else {
      resolve()
    }
  }).then(() => {
    const nodeIds = this.instanceConfigs.map(i => i.id)
    const networkModel = new FullSyncNetwork(nodeIds)
    this.waiter = new Waiter(networkModel)
  })

  run = async () => {
    try {
      await this.conductor.initialize()
    } catch (e) {
      console.error("Error during conductor initialization:")
      console.error(e)
    }

    for (const [desc, execute] of this.scenarios) {
      await execute()
    }
  }

  close = () => this.conductor ? this.conductor.kill() : undefined
}

export const Playbook = PlaybookClass(Conductor)

const makeInstanceConfig = (agentId, dnaConfig) => {
  return {
    id: agentId,
    agent: {
      id: agentId,
      name: agentId,
    },
    dna: dnaConfig
  }
}

const stringifySignal = orig => {
  const signal = Object.assign({}, orig)
  signal.event = JSON.stringify(signal.event)
  signal.pending = signal.pending.map(p => (p.event = JSON.stringify(p.event), p))
  return signal
}
