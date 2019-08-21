import * as T from "./types";
import * as M from "./middleware";
import { Waiter, NetworkMap } from "@holochain/hachiko";
import logger from "./logger";
import { ScenarioApi } from "./api";

type OrchestratorConstructorParams = {
  spawnConductor: T.SpawnConductorFn,
  genConfig: T.GenConfigFn,
  middleware?: any,
  debugLog?: boolean,
}

type RegisteredScenario = {
  desc: string,
  execute: ScenarioExecutor,
  only: boolean,
}

type ScenarioExecutor = () => Promise<void>

export class Orchestrator {

  registerScenario: Function & { only: Function }

  _genConfig: T.GenConfigFn
  _middleware: M.Middleware
  _scenarios: Array<RegisteredScenario>
  _spawnConductor: T.SpawnConductorFn
  _waiter: Waiter

  constructor(o: OrchestratorConstructorParams) {
    this._genConfig = o.genConfig
    this._spawnConductor = o.spawnConductor
    this._middleware = o.middleware || M.unit
    this._scenarios = []

    const registerScenario = (desc, scenario) => this._makeExecutor(desc, scenario, false)
    const registerScenarioOnly = (desc, scenario) => this._makeExecutor(desc, scenario, true)
    this.registerScenario = Object.assign(registerScenario, { only: registerScenarioOnly })
  }

  run = async (): Promise<number> => {
    const onlyTests = this._scenarios.filter(({ only }) => only)
    const tests = onlyTests.length > 0 ? onlyTests : this._scenarios

    logger.debug("About to execute %d tests", tests.length)
    if (onlyTests.length > 0) {
      logger.warn(`.only was invoked; only running ${onlyTests.length} test(s)!`)
    }
    for (const { desc, execute } of tests) {
      logger.debug("Executing test: %s", desc)
      await execute()
    }
    return tests.length
  }

  _makeExecutor = (desc: string, scenario: Function, only: boolean): void => {
    const runner = Object.assign(this._runScenario, { description: desc })
    const execute = () => this._middleware(runner, scenario)
    this._scenarios.push({ desc, execute, only })
  }

  _runScenario = async (scenario: T.ScenarioFn): Promise<void> => {
    const api = new ScenarioApi("TODO")
    return scenario(api)
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

