const tape = require('tape')
const colors = require('colors/safe')

import {connect} from '@holochain/hc-web-client'
import {Waiter, FullSyncNetwork, NodeId, Signal} from '@holochain/scenario-waiter'
import {InstanceConfig, BridgeConfig} from './config'
import {Conductor} from './conductor'
import {ScenarioApi} from './api'

/////////////////////////////////////////////////////////////

export class Playbook {
  instanceConfigs: Array<InstanceConfig>
  bridgeConfigs: Array<BridgeConfig>
  conductor: Conductor
  scenarios: Array<any>
  middleware: Array<any>
  conductorOpts: any | void
  waiter: Waiter

  constructor ({bridges, instances, middleware, debugLog}) {
    this.conductorOpts = {}
    this.conductor = new Conductor(connect, {onSignal: this.onSignal.bind(this), debugLog})
    this.middleware = middleware
    this.instanceConfigs = []
    this.bridgeConfigs = bridges
    this.scenarios = []

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
   * so does wrappedFn
   */
  registerScenario = (desc, origFn) => {
    const runner = this.runScenario(desc)
    let wrappedFn = origFn
    let terminalFn = null
    let i = 0
    for (const m of this.middleware) {
      if (terminalFn) {
        throw new Error(`middleware in position ${i - 1} ('${m.name}') is terminal, cannot include other middleware beyond it!`)
      }
      wrappedFn = m(runner, wrappedFn, desc)
      if (m.isTerminal) {
        terminalFn = m
      }
      i++
    }
    this.scenarios.push([desc, wrappedFn])
  }

  runScenario = desc => async lv2fn => {
    await this.refreshWaiter()
    return this.conductor.run(this.instanceConfigs, this.bridgeConfigs, (instanceMap) => {
      const api = new ScenarioApi(this.waiter)
      return lv2fn(api, instanceMap)
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

  runSuiteSequential = async () => {
    for (const [desc, lv1fn] of this.scenarios) {
      await lv1fn(this.runScenario(desc))
    }
  }

  // runSuiteImmediate = async () => {
  //   const promises = this.scenarios.map(([desc, lv1fn]) => {
  //     console.log(colors.red.inverse('running (1): '), desc)
  //     const result = lv1fn(this.runScenario(desc))
  //     console.log(colors.red.inverse('result (1): '), result)
  //     return result
  //   })
  //   return Promise.all(promises)
  // }

  runSuite = async () => {
    try {
      await this.conductor.initialize()
    } catch (e) {
      console.error("Error during conductor initialization:")
      console.error(e)
    }

    return this.runSuiteSequential()
  }

  close = () => this.conductor.kill()
}


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
