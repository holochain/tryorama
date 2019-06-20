const tape = require('tape')
const colors = require('colors/safe')

import {connect} from '@holochain/hc-web-client'
import {Waiter, FullSyncNetwork, NodeId, Signal} from '@holochain/hachiko'
import {InstanceConfig, BridgeConfig} from './types'
import {Conductor} from './conductor'
import {ScenarioApi} from './api'
import {simpleExecutor} from './executors'
import {identity} from './util'
import logger from './logger'

const MAX_RUNS_PER_CONDUCTOR = 1
const MIN_POOL_SIZE = 1

/////////////////////////////////////////////////////////////

type DioramaConstructorParams = {
  instances?: any,
  bridges?: Array<BridgeConfig>,
  middleware?: any,
  executor?: any,
  debugLog?: boolean,
}

export const DioramaClass = Conductor => class Diorama {
  instanceConfigs: Array<InstanceConfig>
  bridgeConfigs: Array<BridgeConfig>
  conductorPool: Array<{conductor: Conductor, runs: number}>
  scenarios: Array<any>
  middleware: any | void
  executor: any | void
  conductorOpts: any | void
  waiter: Waiter
  startNonce: number

  constructor ({bridges = [], instances = {}, middleware = identity, executor = simpleExecutor, debugLog = false}: DioramaConstructorParams) {
    this.bridgeConfigs = bridges
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
  }

  onSignal (msg: {signal, instance_id: string}) {
    if (msg.signal.signal_type === 'Consistency') {
      // XXX, NB, this '-' magic is because of the nonced instance IDs
      // TODO: deal with this more reasonably
      const ix = msg.instance_id.lastIndexOf('-')
      const node = msg.instance_id.substring(0, ix)
      const signal = stringifySignal(msg.signal)
      this.waiter.handleObservation({node, signal})
    }
  }

  _newConductor (): Conductor {
    this.startNonce += MAX_RUNS_PER_CONDUCTOR * 2 // just to be safe
    return new Conductor(connect, this.startNonce, {onSignal: this.onSignal.bind(this), ...this.conductorOpts})
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
  static dna = (path, id = `${path}`) => ({ path, id })

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

    let conductor
    try {
      conductor = await this.getConductor()
    } catch (e) {
      logger.error("Error during conductor initialization:")
      logger.error(e)
    }

    return conductor.run(this.instanceConfigs, this.bridgeConfigs, (instanceMap) => {
      const api = new ScenarioApi(this.waiter)
      return modifiedScenario(api, instanceMap)
    })
  }

  refreshWaiter = () => new Promise(resolve => {
    if (this.waiter) {
      logger.info("Test over, waiting for Waiter to flush...")
      this.waiter.registerCallback({nodes: null, resolve})
    } else {
      resolve()
    }
  }).then(() => {
    const nodeIds = this.instanceConfigs.map(i => i.id)
    const networkModel = new FullSyncNetwork(nodeIds)
    this.waiter = new Waiter(networkModel)
  })

  run = async () => {
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
