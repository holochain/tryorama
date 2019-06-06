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
  conductor: Conductor
  scenarios: Array<any>
  middleware: any | void
  executor: any | void
  conductorOpts: any | void
  waiter: Waiter

  constructor ({bridges = [], instances = {}, middleware = identity, executor = simpleExecutor, debugLog = false}: DioramaConstructorParams) {
    this.bridgeConfigs = bridges
    this.middleware = middleware
    this.executor = executor
    this.conductorOpts = {debugLog}

    this.scenarios = []
    this.instanceConfigs = []
    this.conductor = new Conductor(connect, {onSignal: this.onSignal.bind(this), ...this.conductorOpts})

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

  onSignal (msg: {signal, instance_id: String}) {
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
    return this.conductor.run(this.instanceConfigs, this.bridgeConfigs, (instanceMap) => {
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
    try {
      await this.conductor.initialize()
    } catch (e) {
      logger.error("Error during conductor initialization:")
      logger.error(e)
    }

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

  close = () => this.conductor ? this.conductor.kill() : undefined
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
