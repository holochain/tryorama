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

type ScenarioModifier = 'only' | 'skip' | null
type RegisteredScenario = {
  api: ScenarioApi,
  desc: string,
  execute: ScenarioExecutor,
  modifier: ScenarioModifier,
}
type Register = (desc: string, scenario: Function) => void

export type TestStats = {
  successes: number,
  errors: Array<TestError>,
}
type TestError = { description: string, error: any }

type ScenarioExecutor = () => Promise<void>

export class Orchestrator {

  registerScenario: Register & { only: Register, skip: Register }

  _genConfigArgs: GenConfigArgsFn
  _middleware: M.Middleware
  _scenarios: Array<RegisteredScenario>
  _spawnConductor: T.SpawnConductorFn
  _reporter: R.Reporter

  constructor(o: OrchestratorConstructorParams = {}) {
    this._genConfigArgs = o.genConfigArgs || defaultGenConfigArgs
    this._spawnConductor = o.spawnConductor || defaultSpawnConductor
    this._middleware = o.middleware || M.unit
    this._scenarios = []
    this._reporter = o.reporter === true
      ? R.basic(x => console.log(x))
      : o.reporter || R.unit

    const registerScenario = (desc, scenario) => this._makeExecutor(desc, scenario, null)
    const registerScenarioOnly = (desc, scenario) => this._makeExecutor(desc, scenario, 'only')
    const registerScenarioSkip = (desc, scenario) => this._makeExecutor(desc, scenario, 'skip')
    this.registerScenario = Object.assign(registerScenario, {
      only: registerScenarioOnly,
      skip: registerScenarioSkip,
    })
  }

  run = async (): Promise<TestStats> => {
    const allTests = this._scenarios
    const onlyTests = allTests.filter(({ modifier }) => modifier === 'only')
    const tests = onlyTests.length > 0
      ? onlyTests
      : allTests.filter(({ modifier }) => modifier !== 'skip')
    let successes = 0
    const errors: Array<TestError> = []

    this._reporter.before(tests.length)

    logger.debug("About to execute %d tests", tests.length)
    if (onlyTests.length > 0) {
      logger.warn(`.only was invoked; only running ${onlyTests.length} test(s)!`)
    }
    if (tests.length < allTests.length) {
      logger.warn(`Skipping ${allTests.length - tests.length} test(s)!`)
    }
    for (const { api, desc, execute } of tests) {
      this._reporter.each(desc)
      try {
        logger.debug("Executing test: %s", desc)
        await api.consistency()
        await execute()
        logger.debug("Test succeeded: %s", desc)
        successes += 1
      } catch (e) {
        logger.debug("Test failed: %s", desc)
        errors.push({ description: desc, error: e })
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

  _makeExecutor = (desc: string, scenario: Function, modifier: ScenarioModifier): void => {
    const api = new ScenarioApi(desc, this, uuidGen())
    const runner = scenario => scenario(api)
    const execute = () => this._middleware(runner, scenario)
    this._scenarios.push({ api, desc, execute, modifier })
  }

}

