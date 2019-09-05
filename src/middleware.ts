const _ = require('lodash')

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
export type Middleware = (run: MiddlewareRunner, scenario: Function) => Promise<void>

/**
 * A MiddlewareRunner is provided by the [Orchestrator], but it is exposed to the middleware
 * author so that it can be called in the appropriate context
 */
export type MiddlewareRunner = (f: Function) => Promise<void>

/** The no-op middleware */
export const unit = (run, f) => run(f)

/**
 * Combine multiple middlewares into a single middleware.
 * The middlewares are applied in the order that they're provided.
 * If using something fancy like `tapeExecutor`, put it at the end of the chain.
 */
export const combine = (...ms: Array<Middleware>): Middleware => {
  return (run, f) => {
    const go = (ms: Array<Middleware>, f: Function) => {
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
export const tapeExecutor = (tape: any): Middleware => (run, f) => new Promise((resolve, reject) => {
  if (f.length !== 2) {
    reject("tapeExecutor middleware requires scenario functions to take 2 arguments, please check your scenario definitions.")
    return
  }
  tape("s.description", t => {
    run(s => {
      // NB: f must return a Promise
      f(s, t)
        .then(() => {
          t.end()
          // resolve()
        })
        .catch((err) => {
          // Include stack trace from actual test function, but all on one line.
          // This is the best we can do for now without messing with tape internals
          t.fail(err.stack ? err.stack : err)
          t.end()
          // reject(err)
        })
    })
  })
  resolve()
})

/** Run tests in series rather than in parallel */
export const runSeries = (() => {
  let lastPromise = Promise.resolve()
  return async (run, f) => {
    const result = run(f)
    lastPromise = lastPromise.catch(e => { }).then(() => result)
    return result
  }
})()