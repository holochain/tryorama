import logger from "./logger";

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
export const combine = (...ms: Array<Middleware>): Middleware =>
  (run, f) => {
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
    return go(ms, f)
  }

/**
 * Given the `tape` module, tapeExecutor produces a middleware 
 * that combines a scenario with a tape test. 
 * It registers a tape test with the same description as the scenario itself.
 * Rather than the usual single ScenarioApi parameter, it expands the scenario function
 * signature to also accept tape's `t` object for making assertions
 * If the test throws an error, it registers the error with tape and does not abort
 * the entire test suite.
 */
export const tapeExecutor = (tape: any) => (run, f) => new Promise((resolve, reject) => {
  run(s => {
    tape(s.description, t => {
      logger.debug('ENTER')
      // TODO: move this outside?
      if (f.length !== 2) {
        const err = "tapeExecutor middleware requires scenario functions to take 2 arguments, please check your scenario definitions."
        t.fail(err)
        t.end()
        reject(err)
        return
      }
      f(s, t)
        .then(() => {
          t.pass('passed! now what. (' + s.description + ')')
          logger.debug('PASS (%s)', s.description)
          t.end()
          resolve()
        })
        .catch((err) => {
          // Include stack trace from actual test function, but all on one line.
          // This is the best we can do for now without messing with tape internals
          logger.debug('FAIL')
          t.fail(err.stack ? err.stack : err)
          t.end()
          reject(err)
        })
    })
  })
})