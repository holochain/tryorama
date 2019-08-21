export type Middleware = (next: MiddlewareRunner, scenario: Function) => void
export type MiddlewareRunner = (f: Function) => void


export const combine = (...ms: Array<Middleware>): Middleware =>
  (next, f) => {
    const go = (ms: Array<Middleware>, f: Function) => {
      const m = ms.pop()
      if (m) {
        const recurse = (g) => go(ms, g)
        return m(recurse, f)
      } else {
        return next(f)
      }
    }
    return go(ms, f)
  }

export const unit = (next, f) => next(f)

export const tapeExecutor = (tape: Middleware) => (next, f) => new Promise((resolve, reject) => {
  if (f.length !== 2) {
    reject("tapeExecutor middleware requires scenario functions to take 3 arguments, please check your scenario definitions.")
  }
  tape(next.description, t => {
    next((s, ins) => f(s, t, ins))
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