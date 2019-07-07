const tape = require('tape')
const colors = require('colors/safe')
const getPort = require('get-port')

import * as _ from 'lodash'

import {Waiter, FullSyncNetwork, NodeId, NetworkMap, Signal} from '@holochain/hachiko'

import * as T from './types'
import {ObjectS} from './types'
import {Conductor} from './conductor'
import {ConductorManaged} from './conductor-managed'
import {ConductorFactory} from './conductor-factory'
import {ScenarioApi} from './api'
import {ConductorMap, InstanceMap} from './instance'
import {simpleExecutor} from './executors'
import {identity} from './util'
import logger from './logger'
import {Callbacks} from './callbacks'

const MAX_RUNS_PER_CONDUCTOR = 1
const MIN_POOL_SIZE = 1

/////////////////////////////////////////////////////////////

type OrchestratorConstructorParams = {
  conductors: ObjectS<T.ConductorConfigShorthand>,
  middleware?: any,
  executor?: any,
  debugLog?: boolean,

  spawnConductor: T.SpawnConductorFn,
  genConfig: T.GenConfigFn,
}

export const OrchestratorClass = Conductor => class Orchestrator {
  conductorConfigs: ObjectS<T.ConductorConfig>
  conductorPool: Array<{conductor: Conductor, runs: number}>
  scenarios: Array<any>
  middleware: any | void
  executor: any | void
  conductorOpts: any | void
  waiter: Waiter
  startNonce: number
  factories: ObjectS<ConductorFactory>
  factoryMap: ObjectS<ConductorFactory>

  constructor ({
    conductors,
    spawnConductor,
    genConfig,
    middleware = identity,
    executor = simpleExecutor,
    debugLog = false,
  }: OrchestratorConstructorParams) {

    this.factories = {}
    this.middleware = middleware
    this.executor = executor
    this.conductorOpts = {debugLog}

    this.scenarios = []
    this.startNonce = 1

    this.conductorConfigs = desugarConductorConfig(conductors)

    const reducer = ([f1, f2], [name, c]) => {
      const factory = new ConductorFactory({
        name,
        spawnConductor: spawnConductor,
        genConfig: genConfig,
        testConfig: c,
        onSignal: this.onSignal.bind(this)
      })
      f1[name] = factory
      f2[name] = (factory)
      return [f1, f2]
    }
    [this.factories, this.factoryMap] = Object.entries(this.conductorConfigs).reduce(
      reducer,
      [{} as ObjectS<ConductorFactory>, {} as ObjectS<ConductorFactory>]
    )

    this.registerScenario.only = this.registerScenarioOnly.bind(this)

    this.refreshWaiter()
  }


  onSignal ({conductorName, instanceId, signal}) {
    const instanceConfig = this.conductorConfigs[conductorName].instances.find(c => c.id === instanceId)
    if (!instanceConfig) {
      throw new Error(`Got a signal from a not-configured instance! conductor: ${conductorName}, instance: ${instanceId}`)
    }
    const dnaId = instanceConfig.dna.id
    const nodeId = makeAgentId(conductorName, instanceId)
    signal = stringifySignal(signal)
    this.waiter.handleObservation({node: nodeId, signal, dna: dnaId})
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

    let conductorMap: ConductorMap = {}

    try {
      let i = 0
      for (const [name, factory] of Object.entries(this.factories)) {
        logger.debug('preparing run...')
        await factory.setup(i++)
        logger.debug('...run prepared.')
      }
    } catch (e) {
      logger.error("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
      logger.error("Error during test instance setup:")
      logger.error(e)
      logger.error("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
      throw e
    }

    try {
      const api = new ScenarioApi(this.waiter, null)
      // Wait for Agent entries, etc. to be gossiped and held
      await api.consistent()
      logger.debug('running scenario...')
      await modifiedScenario(api, this.factoryMap)
      logger.debug('...scenario ran')
    } catch (e) {
      this.failTest(e)
    } finally {
      try {
        let i = 0
        for (const [name, factory] of Object.entries(this.factories)) {
          logger.debug('cleaning up run...')
          await factory.cleanup()
          logger.debug('...cleaned up')
        }
      } catch (e) {
        logger.error("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
        logger.error("Error during test instance cleanup:")
        logger.error(e)
        logger.error("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
        throw e
      }
    }
  }

  failTest (e) {
    logger.error("Test failed while running: %o", e)
    throw e
  }

  refreshWaiter = () => new Promise(resolve => {
    if (this.waiter) {
      logger.info("Test over, waiting for Waiter to flush...")
      // Wait for final networking effects to resolve
      this.waiter.registerCallback({nodes: null, resolve})
    } else {
      resolve()
    }
  }).then(() => {
    const networkModels: NetworkMap = _.chain(this.conductorConfigs)
      .toPairs()
      .map(([name, c]) => c.instances.map(i => ({
        id: `${name}::${i.id}`,
        dna: i.dna.id
      })))
      .flatten()
      .groupBy(n => n.dna)
      .mapValues(ns => new FullSyncNetwork(ns.map(n => n.id)))
      .value()
    this.waiter = new Waiter(networkModels)
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
    Object.values(this.factories).forEach(factory => factory.kill())
  }
}

export const Orchestrator = OrchestratorClass(Conductor)

/**
 * Go from "shorthand" config to "real" config
 */
const desugarConductorConfig = (config: ObjectS<T.ConductorConfigShorthand>): ObjectS<T.ConductorConfig> => {
  const newConfig = {}
  Object.entries(config).forEach(([conductorName, {instances, bridges}]) => {
    const instanceConfigs = Object.entries(instances).map(([instanceId, dnaConfig]) => {
      return makeInstanceConfig(conductorName, instanceId, dnaConfig)
    })
    newConfig[conductorName] = {
      instances: instanceConfigs,
      bridges: bridges,
    }
  })
  return newConfig
}

const makeInstanceConfig = (conductorName, instanceId, dnaConfig): T.InstanceConfig => {
  return {
    id: instanceId,
    agent: {
      id: instanceId,
      name: makeAgentId(conductorName, instanceId),
    },
    dna: dnaConfig
  }
}

const makeAgentId = (conductorName, instanceId) => `${conductorName}::${instanceId}`

const stringifySignal = orig => {
  const signal = Object.assign({}, orig)
  signal.event = JSON.stringify(signal.event)
  signal.pending = signal.pending.map(p => (p.event = JSON.stringify(p.event), p))
  return signal
}
