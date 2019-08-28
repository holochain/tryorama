const uuidGen = require('uuid/v4')

import * as T from "./types";
import * as M from "./middleware";
import * as R from "./reporter";
import { Waiter, NetworkMap } from "@holochain/hachiko";
import logger from "./logger";
import { ScenarioApi } from "./api";
import { defaultGenConfigArgs, defaultSpawnConductor } from "./config";


type OrchestratorConstructorParams = {
  spawnConductor?: T.SpawnConductorFn,
  genConfigArgs?: GenConfigArgsFn,
  reporter?: boolean | R.Reporter,
  middleware?: any,
  debugLog?: boolean,
}

type GenConfigArgsFn = () => Promise<T.GenConfigArgs>

type RegisteredScenario = {
  api: ScenarioApi,
  desc: string,
  execute: ScenarioExecutor,
  only: boolean,
}

export type TestStats = {
  successes: number,
  errors: Array<TestError>,
}
type TestError = { description: string, message: any }

type ScenarioExecutor = () => Promise<void>

export class Orchestrator {

  registerScenario: Function & { only: Function }

  _genConfigArgs: GenConfigArgsFn
  _middleware: M.Middleware
  _scenarios: Array<RegisteredScenario>
  _spawnConductor: T.SpawnConductorFn
  _waiter: Waiter
  _reporter: R.Reporter

  constructor(o: OrchestratorConstructorParams = {}) {
    this._genConfigArgs = o.genConfigArgs || defaultGenConfigArgs
    this._spawnConductor = o.spawnConductor || defaultSpawnConductor
    this._middleware = o.middleware || M.unit
    this._scenarios = []
    this._reporter = o.reporter === true
      ? R.basic(x => console.log(x))
      : o.reporter || R.unit

    const registerScenario = (desc, scenario) => this._makeExecutor(desc, scenario, false)
    const registerScenarioOnly = (desc, scenario) => this._makeExecutor(desc, scenario, true)
    this.registerScenario = Object.assign(registerScenario, { only: registerScenarioOnly })
  }

  run = async (): Promise<TestStats> => {
    const onlyTests = this._scenarios.filter(({ only }) => only)
    const tests = onlyTests.length > 0 ? onlyTests : this._scenarios
    let successes = 0
    const errors: Array<TestError> = []

    this._reporter.before(tests.length)

    logger.debug("About to execute %d tests", tests.length)
    if (onlyTests.length > 0) {
      logger.warn(`.only was invoked; only running ${onlyTests.length} test(s)!`)
    }
    for (const { api, desc, execute } of tests) {
      this._reporter.each(desc)
      try {
        logger.debug("Executing test: %s", desc)
        await execute()
        logger.debug("Test succeeded: %s", desc)
        successes += 1
      } catch (e) {
        logger.debug("Test failed: %s", desc)
        errors.push({ description: desc, message: e })
      } finally {
        await api._cleanup()
      }
    }
    const stats = {
      successes,
      errors
    }
    this._reporter.after(stats)
    return stats
  }

  _makeExecutor = (desc: string, scenario: Function, only: boolean): void => {
    const api = new ScenarioApi(desc, this, uuidGen())
    const runner = scenario => scenario(api)
    const execute = () => this._middleware(runner, scenario)
    this._scenarios.push({ api, desc, execute, only })
  }

  // _refreshWaiter = () => new Promise(resolve => {
  //   if (this._waiter) {
  //     logger.info("Test over, waiting for Waiter to flush...")
  //     // Wait for final networking effects to resolve
  //     this._waiter.registerCallback({ nodes: null, resolve })
  //   } else {
  //     resolve()
  //   }
  // }).then(() => {
  //   const networkModels: NetworkMap = _.chain(this.conductorConfigs)
  //     .toPairs()
  //     .map(([name, c]) => c.instances.map(i => ({
  //       id: `${name}::${i.id}`,
  //       dna: i.dna.id
  //     })))
  //     .flatten()
  //     .groupBy(n => n.dna)
  //     .mapValues(ns => new FullSyncNetwork(ns.map(n => n.id)))
  //     .value()
  //   this._waiter = new Waiter(networkModels)
  // })

}

