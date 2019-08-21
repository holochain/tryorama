import logger from "./logger";

export type Middleware = (run: MiddlewareRunner, scenario: Function) => Promise<void>
export type MiddlewareRunner = (f: Function) => Promise<void>

/**
 * Combine multiple middlewares into a single middleware.
 * The middlewares are applied in the order that they're provided.
 * If using something fancy like `tapeExecutor`, put it at the end of the chain.
 */
export const combine = (...ms: Array<Middleware>): Middleware =>
  (run, f) => {
    const go = (ms: Array<Middleware>, f: Function) => {
      const m = ms.pop()
      if (m) {
        const recurse = (g) => go(ms, g)
        return m(recurse, f)
      } else {
        return run(f)
      }
    }
    return go(ms, f)
  }

/** The no-op middleware */
export const unit = (run, f) => run(f)

/**
 * Given the `tape` module, tapeExecutor produces a middleware that combines a scenario
 * with a tape test. It registers a tape test with the same description as the scenario
 */
export const tapeExecutor = (tape: any) => (run, f) => new Promise((resolve, reject) => {  
  return run(s => 
    tape(s.description, t => {
      if (f.length !== 2) {
        const err = "tapeExecutor middleware requires scenario functions to take 2 arguments, please check your scenario definitions."
        t.fail(err)
        t.end()
        reject(err)
        return
      }
      return f(s, t)
        .catch((err) => {
          try {
            // Include stack trace from actual test function, but all on one line.
            // This is the best we can do for now without messing with tape internals
            t.fail(err.stack)
          } catch (e) {
            t.fail(err)
          }
        })
        .then(() => {
          t.end()
          resolve()
        })
    })
  )
})