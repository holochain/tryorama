import { combineConfigs, adjoin, unsupportedMergeConfigs } from "./config/combine";
import { ScenarioApi } from "./api";
import { trace } from "./util";
import * as T from "./types";
import * as _ from 'lodash'
import logger from "./logger";

interface ApiPlayers<Config> {
  players: (config: Config, data?: any) => Promise<any>
}

type ApiMachineConfigs = ApiPlayers<T.MachineConfigs>
type ApiPlayerConfigs = ApiPlayers<T.PlayerConfigs>

// Bare minimum API expected by tapeExecutor
interface ExecutorApi {
  players: any,
  description: string,
  fail: Function,
}

/**
 * A Runner is provided by the [Orchestrator], but it is exposed to the middleware
 * author so that it can be called in the appropriate context
 */
export type Runner<A> = (f: A) => Promise<void>
/** RunnerS assumes a normal Scenario */
export type RunnerS<A> = (f: Scenario<A>) => Promise<void>

/** The default Scenario function type which takes a single argument */
export type Scenario<S> = (s: S) => Promise<void>
/** A scenario function which takes two arguments */
export type Scenario2<S, T> = (s: S, t: T) => Promise<void>
/** A scenario function which takes three arguments */
export type Scenario3<S, T, U> = (s: S, t: T, u: U) => Promise<void>
/** A scenario function which takes four arguments */
export type Scenario4<S, T, U, V> = (s: S, t: T, u: U, v: V) => Promise<void>

/**
 * Middleware is a composable decorator for scenario functions. A MiddlewareS takes two functions:
 * - the function which will run the scenario
 * - the scenario function itself
 *
 * With these, as a middleware author, you are free to create a new scenario function
 * that wraps the original one, and then use the `run` function to eventually execute
 * that scenario. The purpose of exposing the `run` function is to allow the middleware
 * to set up extra context outside of the running of the scenario, e.g. for integrating
 * with test harnesses.
 */
export type Middleware<A, B> = (run: Runner<B>, original: A) => Promise<void>
/** Middleware assumes mapping from a normal Scenario to another */
export type MiddlewareS<A, B> = (run: RunnerS<B>, original: Scenario<A>) => Promise<void>

/** The no-op middleware */
export const unit = <A>(run: RunnerS<A>, f: Scenario<A>) => run(f)

/** Compose two middlewares, typesafe */
export const compose = <A, B, C>(x: Middleware<A, B>, y: Middleware<B, C>): Middleware<A, C> =>
  (run: Runner<C>, f: A) => {
    return x(g => y(run, g), f)
  }

/** Compose 2 middlewares, typesafe. Same as `compose` */
export const compose2 = compose

/** Compose 3 middlewares, typesafe */
export const compose3 = <A, B, C, D>(
  a: Middleware<A, B>,
  b: Middleware<B, C>,
  c: Middleware<C, D>
): Middleware<A, D> => compose(compose2(a, b), c)

/** Compose 4 middlewares, typesafe */
export const compose4 = <A, B, C, D, E>(
  a: Middleware<A, B>,
  b: Middleware<B, C>,
  c: Middleware<C, D>,
  d: Middleware<D, E>,
): Middleware<A, E> => compose(compose3(a, b, c), d)

/** Compose 5 middlewares, typesafe */
export const compose5 = <A, B, C, D, E, F>(
  a: Middleware<A, B>,
  b: Middleware<B, C>,
  c: Middleware<C, D>,
  d: Middleware<D, E>,
  e: Middleware<E, F>,
): Middleware<A, F> => compose(compose4(a, b, c, d), e)

/**
 * Combine multiple middlewares into a single middleware.
 * NOT typesafe, i.e. type info is lost, but convenient.
 * The middlewares are applied in the *reverse order* that they're provided.
 * i.e. the middleware at the end of the chain is the one to act directly on the user-supplied scenario,
 * and the first middleware is the one to provide the clean vanilla scenario that the orchestrator knows how to run
 * So, if using something fancy like `tapeExecutor`, put it at the beginning of the chain.
 */
export const combine = (...ms) => ms.reduce(compose)


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
export const tapeExecutor = <A extends ExecutorApi>(tape: any): Middleware<Scenario2<A, any>, Scenario<A>> => (run, f) => new Promise((resolve, reject) => {
  if (f.length !== 2) {
    reject("tapeExecutor middleware requires scenario functions to take 2 arguments, please check your scenario definitions.")
    return
  }
  run(s => {
    tape(s.description, t => {
      s.fail = t.fail
      const p = async () => await f(s, t)
      p()
        .then(() => {
          t.end()
          resolve()
        })
        .catch((err) => {
          // Include stack trace from actual test function, but all on one line.
          // This is the best we can do for now without messing with tape internals
          const repr = err.stack ? err.stack : err
          logger.error("Test error: %o", repr)
          t.fail("Test threw an exception. See output for details.")
          t.end()
          reject(err)
        })
    })
    return Promise.resolve()  // to satisfy the type
  })
})

/**
 * Run tests in series rather than in parallel.
 * Needs to be invoked as a function so types can be inferred at moment of creation.
 */
export const runSeries = <A>(): Middleware<A, A> => {
  let lastPromise = Promise.resolve()
  return async (run: Runner<A>, f: A) => {
    lastPromise = lastPromise.then(() => run(f))
    return lastPromise
  }
}

/**
 * Take all configs defined for all machines and all players,
 * merge the configs into one big TOML file,
 * and create a single player on the local machine to run it.
 * TODO: currently BROKEN.
*/
export const singleConductor: MiddlewareS<ApiMachineConfigs, ApiMachineConfigs> = (run: RunnerS<ApiMachineConfigs>, f: Scenario<ApiMachineConfigs>) => run((s: ScenarioApi) => {
  unsupportedMergeConfigs('singleConductor middleware')
  const s_ = _.assign({}, s, {
    players: async (machineConfigs: T.MachineConfigs, ...a) => {
      // throw away machine info, flatten to just all player names
      const playerConfigs = unwrapMachineConfig(machineConfigs)
      const playerNames = _.keys(playerConfigs)
      const combined = combineConfigs(machineConfigs)
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
  })
  return f(s_)
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

// TODO: add test
export const dumbWaiter = interval => (run, f): MiddlewareS<ApiMachineConfigs, ApiMachineConfigs> => run(s =>
  f(Object.assign({}, s, {
    consistency: () => new Promise(resolve => {
      console.log(`dumbWaiter is waiting ${interval}ms...`)
      setTimeout(resolve, interval)
    })
  }))
)

/**
 * Allow a test to skip the level of machine configuration
 * This middleware wraps the player configs in the "local" machine
 */
export const localOnly: MiddlewareS<ApiPlayerConfigs, ApiMachineConfigs> = (run, f) => run(s => {
  const s_ = _.assign({}, s, {
    players: (configs, ...a) => s.players({ local: configs }, ...a)
  })
  return f(s_)
})

/**
 * Allow a test to skip the level of machine configuration
 * This middleware finds a new machine for each N players, and returns the
 * properly wrapped config specifying the acquired machine endpoints
 */
export const groupPlayersByMachine = (trycpEndpoints: Array<string>, playersPer: number): MiddlewareS<ApiPlayerConfigs, ApiMachineConfigs> => (run, f) => run(s => {
  let urlIndex = 0
  const s_ = _.assign({}, s, {
    players: async (configs: T.PlayerConfigs, ...a) => {
      const numConfigs = _.keys(configs).length
      if (numConfigs > trycpEndpoints.length * playersPer) {
        throw new Error(
          `Error while applying groupPlayersByMachine middleware: Can't fit ${numConfigs} conductors on ${trycpEndpoints.length} machines in groups of ${playersPer}!`
        )
      }

      const machines = {}
      for (const e of _.range(0, trycpEndpoints.length)) {
        const endpoint = trycpEndpoints[e]
        const machine = {}
        let config
        for (const p of _.range(0, playersPer)) {
          const index = String(e * playersPer + p)
          config = configs[index]
          if (!config) {
            break
          }
          machine[index] = config
        }
        if (!_.isEmpty(machine)) {
          machines[endpoint] = machine
        }
        if (!config) {
          break
        }
      }
      return s.players(machines, ...a)
    }
  })
  return f(s_)
})


/**
 * Allow a test to skip the level of machine configuration
 * This middleware finds a new machine for each player, and returns the
 * properly wrapped config specifying the acquired machine endpoints
 */
export const machinePerPlayer = (endpoints) => groupPlayersByMachine(endpoints, 1)


const unwrapMachineConfig = (machineConfigs: T.MachineConfigs): T.PlayerConfigs =>
  _.chain(machineConfigs)
    .values()
    .map(_.toPairs)
    .flatten()
    .fromPairs()
    .value()
