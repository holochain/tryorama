const tape = require('tape')
const colors = require('colors/safe')

import {connect} from '../../hc-web-client'
import {InstanceConfig} from './config'
import {Conductor} from './conductor'

export class DnaInstance {

  id: string
  agentId: string
  dnaAddress: string
  conductor: any

  constructor (instance, conductor: Conductor) {
    this.id = instance.id
    this.agentId = instance.agent.id
    this.dnaAddress = instance.dna.id
    this.conductor = conductor
  }

  // internally calls `this.conductor.call`
  async call (zome, fn, params) {
    try {
      const result = await this.conductor.callZome(this.id, zome, fn)(params)
      console.info(colors.blue.inverse("zome call"), zome, fn, params)
      return JSON.parse(result)
    } catch (e) {
      console.error('Exception occurred while calling zome function: ', e)
      throw e
    }
  }
}

/// //////////////////////////////////////////////////////////

export class Playbook {
  instanceConfigs: Array<InstanceConfig>
  instanceMap: {[id: string]: DnaInstance}
  conductor: Conductor
  scenarios: Array<any>
  middleware: Array<any>
  conductorOpts: any | void
  immediate: boolean

  constructor ({bridges, instances, middleware, debugLog}) {
    this.conductor = new Conductor(connect)
    this.middleware = middleware
    this.instanceConfigs = []
    this.instanceMap = {}
    this.scenarios = []
    this.immediate = false
    Object.entries(instances).forEach(([agentId, dnaConfig]) => {
      console.debug('agentId', agentId)
      console.debug('dnaConfig', dnaConfig)
      const instanceConfig = makeInstanceConfig(agentId, dnaConfig)
      const id = instanceConfig.id
      this.instanceConfigs.push(instanceConfig)
      this.instanceMap[id] = new DnaInstance(instanceConfig, this.conductor)
    })
    this.conductorOpts = {debugLog}
  }

  /**
   * More conveniently create config for a DNA
   * @type {[type]}
   */
  static dna = (path, id = `${path}`) => ({ path, id })

  /**
   * origFn takes (s, instances)
   * so does wrappedFn
   */
  registerScenario = (desc, origFn) => {
    const wrappedFn = this.middleware.reduce((f, m) => m(desc, f), origFn)
    this.scenarios.push([desc, wrappedFn])
  }

  runScenario = desc => lv2fn => this.conductor.run(this.instanceConfigs, () => {
    console.log(colors.green.inverse('running (2): '), desc)
    const s = 'TODO'
    const result = lv2fn(s, this.instanceMap)
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

    // if (this.immediate) {
      // return this.runSuiteImmediate()
    // } else {
      return this.runSuiteSequential()
    // }
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