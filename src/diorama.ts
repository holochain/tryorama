const tape = require('tape')
const colors = require('colors/safe')

import * as _ from 'lodash'

import {connect} from '@holochain/hc-web-client'
import {Waiter, FullSyncNetwork, NodeId, NetworkMap, Signal} from '@holochain/hachiko'
import {InstanceConfig, BridgeConfig, ConductorConfig} from './types'
import {Conductor} from './conductor'
import {ScenarioApi} from './api'
import {simpleExecutor} from './executors'
import {identity} from './util'
import logger from './logger'
import {Callbacks} from './callbacks'

const MAX_RUNS_PER_CONDUCTOR = 1
const MIN_POOL_SIZE = 1

/////////////////////////////////////////////////////////////

type DioramaConstructorParams = {
  conductors?: any,
  middleware?: any,
  executor?: any,
  debugLog?: boolean,
  callbacksAddress?: string,
  callbacksPort?: number,
}

export const DioramaClass = Conductor => class Diorama {
  conductorConfigs: {[name: string]: ConductorConfig}
  conductorPool: Array<{conductor: Conductor, runs: number}>
  scenarios: Array<any>
  middleware: any | void
  executor: any | void
  conductorOpts: any | void
  waiter: Waiter
  startNonce: number
  callbacks: Callbacks | void
  conductors: void | any
  haveAllConductors: Promise<void>


  constructor ({
    conductorConfigs = {},
    middleware = identity,
    executor = simpleExecutor,
    debugLog = false,
    externalConductors = false,
    callbacksAddress = '0.0.0.0',
    callbacksPort = 9999,
  }: DioramaConstructorParams) {

    this.conductorConfigs = conductorConfigs
    this.middleware = middleware
    this.executor = executor
    this.conductorOpts = {debugLog}

    this.scenarios = []
    this.instanceConfigs = []
    this.conductorPool = []
    this.startNonce = 1

    Object.entries(instances).forEach(([agentId, dnaConfig]) => {
      logger.debug('agentId', agentId)
      logger.debug('dnaConfig', dnaConfig)
      const instanceConfig = makeInstanceConfig(agentId, dnaConfig)
      const id = instanceConfig.id
      this.instanceConfigs.push(instanceConfig)
    })

    this.registerScenario.only = this.registerScenarioOnly.bind(this)

    this.refreshWaiter()

    this.haveAllConductors = new Promise

    const checkHaveAllConductors = () => {
      for (const conductorName of Object.keys(this.conductorConfigs)) {
        if(!this.conductors[conductorName]) {
          return false
        }
      }
      return true
    }

    this.conductors = {}
    this.callbacks = new Callbacks(callbacksAddress, callbacksPort, (conductor) => {
        this.conductors[conductor.name] = this._newConductor(conductor)
        if(this.checkHaveAllConductors()) {
          this.haveAllConductors.resolve()
        }
    })
  }

  onSignal (msg: {signal, instance_id: string}) {
    if (msg.signal.signal_type === 'Consistency') {
      // XXX, NB, this '-' magic is because of the nonced instance IDs
      // TODO: deal with this more reasonably
      const ix = msg.instance_id.lastIndexOf('-')
      const node = msg.instance_id.substring(0, ix)
      const signal = stringifySignal(msg.signal)
      const instanceConfig = this.instanceConfigs.find(c => c.id === node)
      if (!instanceConfig) {
        throw new Error(`Got a signal from a not-configured instance! id: ${node}`)
      }
      const dnaId = instanceConfig.dna.id
      this.waiter.handleObservation({node, signal, dna: dnaId})
    }
  }

  _newConductor (externalConductor): Conductor {
    this.startNonce += MAX_RUNS_PER_CONDUCTOR * 2 // just to be safe
    return new Conductor(connect, this.startNonce, externalConductor, {onSignal: this.onSignal.bind(this), ...this.conductorOpts})
  }

  getConductor = async (): Promise<Conductor> => {
    logger.info("conductor pool size: %s", this.conductorPool.length)
    this.conductorPool = this.conductorPool.filter(c => {
      const done = c.runs >= MAX_RUNS_PER_CONDUCTOR
      if (done) {
        logger.info("killing conductor after %s runs", c.runs)
        c.conductor.kill()
      }
      return !done
    })

    while (this.conductorPool.length < MIN_POOL_SIZE) {
      const newConductor = this._newConductor()
      await newConductor.initialize()
      this.conductorPool.push({
        conductor: newConductor,
        runs: 0
      })
    }

    const item = this.currentConductor()
    item.runs += 1
    return item.conductor
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
    await this.refreshWaiter()
    const modifiedScenario = this.middleware(scenario)

    let conductorMap = {}

    try {
      for (const [name, conductor] of Object.entries(this.conductors)) {
        let config = this.conductorConfigs[name]
        conductor.prepareRun(config.instanceConfigs, config.bridgeConfigs)
        conductorMap[name] = conductor.instanceMap
      }
    } catch (e) {
      logger.error("Error during conductor initialization:")
      logger.error(e)
    }

    try {
      const api = new ScenarioApi(this.waiter)
      modifiedScenario(api, instanceMap)
    } catch (e) {
      this.failTest(e)
    }

    for (const conductor of this.conductors) {
      conductor.cleanupRun()
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
    const networkModels: NetworkMap = _.chain(this.instanceConfigs)
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
