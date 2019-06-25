const tape = require('tape')
const colors = require('colors/safe')

import * as _ from 'lodash'

import {connect} from '@holochain/hc-web-client'
import {Waiter, FullSyncNetwork, NodeId, NetworkMap, Signal} from '@holochain/hachiko'

import * as T from './types'
import {ObjectS} from './types'
import {Conductor} from './conductor'
import {ScenarioApi} from './api'
import {ConductorMap, InstanceMap} from './instance'
import {simpleExecutor} from './executors'
import {identity} from './util'
import logger from './logger'
import {Callbacks} from './callbacks'

const MAX_RUNS_PER_CONDUCTOR = 1
const MIN_POOL_SIZE = 1

/////////////////////////////////////////////////////////////

type DioramaConstructorParams = {
  conductors: ObjectS<T.ConductorConfigShorthand>,
  middleware?: any,
  executor?: any,
  debugLog?: boolean,
  callbacksAddress?: string,
  callbacksPort?: number,
}

export const DioramaClass = Conductor => class Diorama {
  conductorConfigs: ObjectS<T.ConductorConfig>
  conductorPool: Array<{conductor: Conductor, runs: number}>
  scenarios: Array<any>
  middleware: any | void
  executor: any | void
  conductorOpts: any | void
  waiter: Waiter
  startNonce: number
  callbacks: Callbacks | void
  conductors: Array<Conductor>
  haveAllConductors: Promise<void>
  _resolveHaveAllConductors: any


  constructor ({
    conductors,
    middleware = identity,
    executor = simpleExecutor,
    debugLog = false,
    callbacksAddress = '0.0.0.0',
    callbacksPort = 9999,
  }: DioramaConstructorParams) {

    this.conductorConfigs = {}
    this.middleware = middleware
    this.executor = executor
    this.conductorOpts = {debugLog}

    this.scenarios = []
    this.conductorPool = []
    this.startNonce = 1

    this.conductorConfigs = desugarConductorConfig(conductors)

    this.registerScenario.only = this.registerScenarioOnly.bind(this)

    this.refreshWaiter()

    this.haveAllConductors = new Promise(resolve => {
      this._resolveHaveAllConductors = resolve
    })

    this.callbacks = new Callbacks(callbacksAddress, callbacksPort, (conductor: T.ExternalConductor) => {
        logger.info("Conductor connected: " + conductor.name)
        this.conductors.push(this._newConductor(conductor))
        const hasAll = Object.keys(this.conductorConfigs).every(name => name in this.conductors)
        if (hasAll) {
          this._resolveHaveAllConductors()
        }
    })
  }

  // TODO++ move into conductor
  onSignal (msg: {signal, instance_id: string}) {
  //   if (msg.signal.signal_type === 'Consistency') {
  //     // XXX, NB, this '-' magic is because of the nonced instance IDs
  //     // TODO: deal with this more reasonably
  //     const ix = msg.instance_id.lastIndexOf('-')
  //     const node = msg.instance_id.substring(0, ix)
  //     const signal = stringifySignal(msg.signal)
  //     const instanceConfig = this.instanceConfigs.find(c => c.id === node)
  //     if (!instanceConfig) {
  //       throw new Error(`Got a signal from a not-configured instance! id: ${node}`)
  //     }
  //     const dnaId = instanceConfig.dna.id
  //     this.waiter.handleObservation({node, signal, dna: dnaId})
  //   }
  }

  _newConductor (externalConductor): Conductor {
    this.startNonce += MAX_RUNS_PER_CONDUCTOR * 2 // just to be safe
    return new Conductor(connect, this.startNonce, externalConductor, {onSignal: this.onSignal.bind(this), ...this.conductorOpts})
  }

  currentConductor () {
    return this.conductorPool[0]
  }

  /**
   * More conveniently create config for a DNA
   */
  static dna = (path, id = `${path}`, opts = {}) => ({ path, id, ...opts })

  /**
   * More conveniently create config for a bridge
   */
  static bridge = (handle, caller_id, callee_id) => ({handle, caller_id, callee_id})

  /**
   * scenario takes (s, instances)
   */
  registerScenario: any = (desc, scenario) => {
    const execute = () => this.executor(
      this.runScenario,
      scenario,
      desc
    )
    this.scenarios.push([desc, execute, false])
  }

  registerScenarioOnly = (desc, scenario) => {
    const execute = () => this.executor(
      this.runScenario,
      scenario,
      desc
    )
    this.scenarios.push([desc, execute, true])
  }

  runScenario = async scenario => {
    logger.info("Waiting for for conductors to connect.")
    logger.info("Conductors in config: "+Object.keys(this.conductorConfigs))
    await this.refreshWaiter()
    const modifiedScenario = this.middleware(scenario)

    let conductorMap: ConductorMap = {}

    try {
      let i = 0
      for (const [name, config] of Object.entries(this.conductorConfigs)) {
        let conductor = this.conductors[i++]
        conductor.prepareRun(config)
        conductorMap[name] = conductor.instanceMap
      }
    } catch (e) {
      logger.error("Error during test instance setup:")
      logger.error(e)
    }

    try {
      const api = new ScenarioApi(this.waiter)
      modifiedScenario(api, conductorMap)
    } catch (e) {
      this.failTest(e)
    }

    try {
      let i = 0
      for (const [name, config] of Object.entries(this.conductorConfigs)) {
        let conductor = this.conductors[i++]
        conductor.cleanupRun(config)
      }
    } catch (e) {
      logger.error("Error during test instance cleanup:")
      logger.error(e)
    }
  }

  failTest (e) {
    logger.error("Test failed while running: %j", e)
    throw e
  }

  refreshWaiter = () => new Promise(resolve => {
    if (this.waiter) {
      logger.info("Test over, waiting for Waiter to flush...")
      this.waiter.registerCallback({nodes: null, resolve})
    } else {
      resolve()
    }
  }).then(() => {
    const networkModels: NetworkMap = _.chain(this.conductorConfigs)
      .values()
      .map(c => c.instances)
      .flatten()
      .map(i => ({
        id: i.id,
        dna: i.dna.id,
      }))
      .groupBy(n => n.dna)
      .mapValues(ns => new FullSyncNetwork(ns.map(n => n.id)))
      .value()
    this.waiter = new Waiter(networkModels)
  })

  run = async () => {
    await this.haveAllConductors

    const onlyTests = this.scenarios.filter(([desc, execute, only]) => only)

    if (onlyTests.length > 0) {
      logger.warn(`.only was invoked, only running ${onlyTests.length} test(s)!`)
      for (const [desc, execute, _] of onlyTests) {
        await execute()
      }
    } else {
      for (const [desc, execute, _] of this.scenarios) {
        await execute()
      }
    }
    this.close()
  }

  close = () => {
    for (const {conductor} of this.conductorPool) {
      conductor.kill()
    }
    if(this.callbacks) {
      this.callbacks.stop()
    }
  }
}

export const Diorama = DioramaClass(Conductor)

/**
 * Go from "shorthand" config to "real" config
 */
const desugarConductorConfig = (config: ObjectS<T.ConductorConfigShorthand>): ObjectS<T.ConductorConfig> => {
  const newConfig = {}
  Object.entries(config).forEach(([conductorName, {instances, bridges}]) => {
    const instanceConfigs = Object.entries(instances).map(([agentId, dnaConfig]) => {
      return makeInstanceConfig(agentId, dnaConfig)
    })
    newConfig[conductorName] = {
      instances: instanceConfigs,
      bridges: bridges,
    }
  })
  return newConfig
}

const makeInstanceConfig = (agentId, dnaConfig): T.InstanceConfig => {
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
