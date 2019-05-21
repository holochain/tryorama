const tape = require('tape')
const colors = require('colors/safe')

import {connect} from '@holochain/hc-web-client'
import {InstanceConfig, BridgeConfig} from './config'
import {Conductor} from './conductor'
import {ScenarioApi} from './api'


/// //////////////////////////////////////////////////////////

export class Playbook {
  instanceConfigs: Array<InstanceConfig>
  bridgeConfigs: Array<BridgeConfig>
  conductor: Conductor
  scenarios: Array<any>
  middleware: Array<any>
  conductorOpts: any | void
  immediate: boolean

  constructor ({bridges, instances, middleware, debugLog}) {
    this.conductor = new Conductor(connect)
    this.middleware = middleware
    this.instanceConfigs = []
    this.bridgeConfigs = bridges
    this.scenarios = []
    this.immediate = false
    Object.entries(instances).forEach(([agentId, dnaConfig]) => {
      console.debug('agentId', agentId)
      console.debug('dnaConfig', dnaConfig)
      const instanceConfig = makeInstanceConfig(agentId, dnaConfig)
      const id = instanceConfig.id
      this.instanceConfigs.push(instanceConfig)
    })
    this.conductorOpts = {debugLog}
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

  runScenario = desc => lv2fn => this.conductor.run(this.instanceConfigs, this.bridgeConfigs, (instanceMap) => {
    console.log(colors.green.inverse('running (2): '), desc)
    const api = new ScenarioApi
    const result = lv2fn(api, instanceMap)
    console.log(colors.green.inverse('result (2): '), result)
    return result
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