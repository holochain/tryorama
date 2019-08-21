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

export const tapeExecutor = (tape: Middleware) => (run, f) => new Promise((resolve, reject) => {
  if (f.length !== 2) {
    reject("tapeExecutor middleware requires scenario functions to take 3 arguments, please check your scenario definitions.")
  }
  tape(run.description, t => {
    run((s, ins) => f(s, t, ins))
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
})