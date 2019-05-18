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
  opts: any | void

  constructor ({bridges, instances, middleware, debugLog}) {
    this.conductor = new Conductor(connect)
    this.middleware = middleware
    this.instanceConfigs = []
    this.instanceMap = {}
    this.scenarios = []
    Object.entries(instances).forEach(([agentId, dnaConfig]) => {
      console.debug('agentId', agentId)
      console.debug('dnaConfig', dnaConfig)
      const instanceConfig = makeInstanceConfig(agentId, dnaConfig)
      const id = instanceConfig.id
      this.instanceConfigs.push(instanceConfig)
      this.instanceMap[id] = new DnaInstance(instanceConfig, this.conductor)
    })
    this.opts = {debugLog}
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

  runScenario = fn => this.conductor.run(this.instanceConfigs, () => {
    console.log("[[[ beginning of conductor.run")
    const s = 'TODO'
    return fn(s, this.instanceMap)
  })


  runSuite = async () => {
    try {
      await this.conductor.initialize()
    } catch (e) {
      console.error("Error during conductor initialization:")
      console.error(e)
    }
    const promises = this.scenarios.map(([desc, fn]) => {
      console.log(colors.green.inverse('running: '), desc)
      const p = fn(this.runScenario)
      console.log('p', p)
      return p
    })
    console.log(promises)
    return Promise.all(promises)
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