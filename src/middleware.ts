import { combineConfigs, adjoin } from "./config/combine";
import { ScenarioApi } from "./api";
import { invokeMRMM } from "./trycp";
import { trace } from "./util";
import * as T from "./types";

const _ = require('lodash')

interface ApiPlayers<Config> {
  players: (config: Config, data?: any) => Promise<any>
}

type ApiMachineConfigs = ApiPlayers<T.MachineConfigs>
type ApiPlayerConfigs = ApiPlayers<T.PlayerConfigs>


/**
 * A Runner is provided by the [Orchestrator], but it is exposed to the middleware
 * author so that it can be called in the appropriate context
 */
export type Runner<A> = (f: Scenario<A>) => Promise<void>
export type RunnerT<A> = (f: A) => Promise<void>

export type Scenario<S> = (s: S) => Promise<void>
export type Scenario2<S, T> = (s: S, t: T) => Promise<void>
export type ScenarioModded<T> = ((s: any) => Promise<void>) & { __phantom__: T | never }

/**
 * Middleware is a decorator for scenario functions. A Middleware takes two functions:
 * - the function which will run the scenario
 * - the scenario function itself
 * 
 * With these, as a middleware author, you are free to create a new scenario function
 * that wraps the original one, and then use the `run` function to eventually execute
 * that scenario. The purpose of exposing the `run` function is to allow the middleware
 * to set up extra context outside of the running of the scenario, e.g. for integrating
 * with test harnesses.
 */
export type Middleware<A, B> = (run: Runner<A>, original: Scenario<B>) => Promise<void>
export type MiddlewareT<A, B> = (run: RunnerT<A>, original: B) => Promise<void>

/** The no-op middleware */
export const unit = <A>(run: Runner<A>, f: Scenario<A>) => run(f)

/**
 * Combine multiple middlewares into a single middleware.
 * The middlewares are applied in the order that they're provided.
 * If using something fancy like `tapeExecutor`, put it at the end of the chain.
 */
export const combine = (...ms: Array<Middleware<any, any>>): Middleware<any, any> => {
  return (run, f) => {
    const go = (ms: Array<Middleware<any, any>>, f: Scenario<any>) => {
      // grab the next middleware
      const m = ms.pop()
      if (m) {
        // if it exists, run it, where the runner actually just recurses
        // to get the *next* middleware in the chain
        const recurse = (g) => go(ms, g)
        return m(recurse, f)
      } else {
        // otherwise, use the actual runner on the final middleware now that it
        // has been composed with all the previous middlewares
        return run(f)
      }
    }
    return go(_.cloneDeep(ms), f)
  }
}

export const compose = <A, B, C>(x: Middleware<A, B>, y: Middleware<B, C>): Middleware<A, C> =>
  (run: Runner<A>, f: Scenario<C>) => {
    return y(g => x(run, g), f)
  }

type TapeExecutor = {}

/**
 * Given the `tape` module, tapeExecutor produces a middleware 
 * that combines a scenario with a tape test. 
 * It registers a tape test with the same description as the scenario itself.
 * Rather than the usual single ScenarioApi parameter, it expands the scenario function
 * signature to also accept tape's `t` object for making assertions
 * If the test throws an error, it registers the error with tape and does not abort
 * the entire test suite.
 * 
 * NB: This has had intermittent problems that seemed to fix themselves magically.
 * Tape is a bit brittle when it comes to dynamically specifying tests.
 * Beware...
 * 
 * If problems persist, it may be necessary to resolve this promise immediately so that
 * all tape tests can be registered synchronously. Then it is a matter of getting the
 * entire test suite to await the end of all tape tests. It could be done by specifying
 * a parallel vs. serial mode for test running.
 */
export const tapeExecutor = <A extends ScenarioApi>(tape: any): MiddlewareT<Scenario<A>, Scenario2<A, any>> => (run, f) => new Promise((resolve, reject) => {
  if (f.length !== 2) {
    reject("tapeExecutor middleware requires scenario functions to take 2 arguments, please check your scenario definitions.")
    return
  }
  run(s => {
    tape(s.description, t => {
      const p = async () => await f(s, t)
      p()
        .then(() => {
          t.end()
          resolve()
        })
        .catch((err) => {
          // Include stack trace from actual test function, but all on one line.
          // This is the best we can do for now without messing with tape internals
          t.fail(err.stack ? err.stack : err)
          t.end()
          reject(err)
        })
    })
    return Promise.resolve()  // to satisfy the type
  })
})

/** Run tests in series rather than in parallel */
export const runSeries = (() => {
  let lastPromise = Promise.resolve()
  return async (run, f) => {
    const result = run(f)
    lastPromise = lastPromise.catch(e => { /* TODO */ }).then(() => result)
    return result
  }
})()

/** 
 * Take all configs defined for all machines and all players,
 * merge the configs into one big TOML file, 
 * and create a single player on the local machine to run it.
*/
export const singleConductor = (run: Runner<ApiMachineConfigs>, f: Scenario<ApiMachineConfigs>) => run((s: ScenarioApi) => {
  const players = async (machineConfigs: T.MachineConfigs, ...a) => {
    // throw away machine info, flatten to just all player names
    const playerConfigs = unwrapMachineConfig(machineConfigs)
    const playerNames = _.keys(playerConfigs)
    const combined = combineConfigs(machineConfigs, s.globalConfig())
    const { combined: player } = await s.players({ local: { combined } }, true)
    const players = playerNames.map(name => {
      const modify = adjoin(name)
      const p = {
        call: (instanceId, ...a) => player.call(modify(instanceId), a[0], a[1], a[2]),
        info: (instanceId) => player.instance(modify(instanceId)),
        instance: (instanceId) => player.instance(modify(instanceId)),
        spawn: () => { throw new Error("player.spawn is disabled by singleConductor middleware") },
        kill: () => { throw new Error("player.kill is disabled by singleConductor middleware") },
      }
      return [name, p]
    })
    return _.fromPairs(players)
  }
  return f(_.assign({}, s, { players }))
})

// TODO: add test
export const callSync = (run, f) => run(s => {
  const s_ = _.assign({}, s, {
    players: async (...a) => {
      const players = await s.players(...a)
      const players_ = _.mapValues(
        players,
        api => _.assign(api, {
          callSync: async (...b) => {
            const result = await api.call(...b)
            await s.consistency()
            return result
          }
        })
      )
      return players_
    }
  })
  return f(s_)
})

/**
 * Allow a test to skip the level of machine configuration
 * This middleware wraps the player configs in the "local" machine
 */
export const localOnly: Middleware<ApiMachineConfigs, ApiPlayerConfigs> = (run, f) => run(s => {
  const s_ = _.assign({}, s, {
    players: (configs, ...a) => s.players({ local: configs }, ...a)
  })
  return f(s_)
})

/**
 * Allow a test to skip the level of machine configuration
 * This middleware finds a new machine for each player, and returns the
 * properly wrapped config specifying the acquired machine endpoints
 */
export const machinePerPlayer = (mrmmUrl): Middleware<ApiMachineConfigs, ApiPlayerConfigs> => (run, f) => run(s => {
  const s_ = _.assign({}, s, {
    players: async (configs: T.PlayerConfigs, ...a) => {
      const pairs = await _.chain(configs)
        .toPairs()
        .map(async ([playerName, config]) => {
          const machineEndpoint = await invokeMRMM(mrmmUrl)
          return [machineEndpoint, { [playerName]: config }]
        })
        .thru(x => Promise.all(x))
        .value()
      const wrappedConfig = _.fromPairs(pairs)
      return s.players(wrappedConfig, ...a)
    }
  })
  return f(s_)
})

const unwrapMachineConfig = (machineConfigs: T.MachineConfigs): T.PlayerConfigs =>
  _.chain(machineConfigs)
    .values()
    .map(_.toPairs)
    .flatten()
    .fromPairs()
    .value()
