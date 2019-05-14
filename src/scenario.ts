const tape = require('tape')
const colors = require('colors/safe')

import {connect} from '../../hc-web-client'
import {Conductor} from './conductor'

type InstanceConfig = {
  id: string
  agentId: string
  dnaAddress: string
}

export class DnaInstance {

  id: string
  agentId: string
  dnaAddress: string
  conductor: any

  constructor (instanceId, conductor) {
    this.id = instanceId
    this.conductor = conductor
    this.agentId = this.conductor.agentId(instanceId)
    this.dnaAddress = this.conductor.dnaAddress(instanceId)
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

  // internally calls `this.call`
  callWithPromise (zome, fn, params): [any, Promise<{}>] {
    try {
      const promise = new Promise((fulfill, reject) => {
        this.conductor.register_callback(() => fulfill())
      })
      const result = this.call(zome, fn, params)
      return [result, promise]
    } catch (e) {
      return [undefined, Promise.reject(e)]
    }
  }

  // internally calls `this.callWithPromise`
  callSync (zome, fn, params) {
    const [result, promise] = this.callWithPromise(zome, fn, params)
    return promise.then(() => result)
  }
}

/// //////////////////////////////////////////////////////////

export class Scenario {
  instanceConfigs: Array<InstanceConfig>
  opts: any | void
  static _tape: any

  constructor (instanceConfigs, opts) {
    this.instanceConfigs = instanceConfigs
    this.opts = opts
  }

  static setTape (tape) {
    Scenario._tape = tape
  }

  /**
     * Run a test case, specified by a closure:
     * (stop, {instances}) => { test body }
     * where `stop` is a function that ends the test and shuts down the running Conductor
     * and the `instances` is an Object of instances specified in the config, keyed by "name"
     * (name is the optional third parameter of `Config.instance`)
     *
     * e.g.:
     *      scenario.run(async (stop, {alice, bob, carol}) => {
     *          const resultAlice = await alice.callSync(...)
     *          const resultBob = await bob.callSync(...)
     *          assert(resultAlice === resultBob)
     *          stop()
     *      })
     */
  run (fn) {
    const conductor = new Conductor(
      this.instanceConfigs,
      connect,
      this.opts
    )
    return conductor.run((stop) => {
      const instances = {}
      this.instanceConfigs.forEach(instanceConfig => {
        const id = instanceConfig.id
        if (id in instances) {
          throw `instance with duplicate id '${id}', please give one of these instances a new id,\ne.g. Config.instance(agent, dna, "new-id")`
        }
        instances[id] = new DnaInstance(id, conductor)
      })
      return fn(stop, instances)
    })
  }

  runTape (description, fn) {
    if (!Scenario._tape) {
      throw new Error("must call `Scenario.setTape(require('tape'))` before running tape-based tests!")
    }
    return new Promise(resolve => {
      Scenario._tape(description, async t => {
        try {
          await this.run((stop, instances) => {
            return fn(t, instances).then(() => stop())
          })
        } catch (e) {
          t.fail(e)
        } finally {
          t.end()
          resolve()
        }
      })
    })
  }
}
