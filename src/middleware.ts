export type Middleware = (next: MiddlewareRunner, scenario: Function, desc?: string) => void
export type MiddlewareRunner = (f: Function, desc?: string) => void


export const combine = (...ms: Array<Middleware>): Middleware =>
  (next, f, desc) => {
    const go = (ms: Array<Middleware>, f: Function, desc?: string) => {
      const m = ms.pop()
      if (m) {
        const recurse = (g, desc) => go(ms, g, desc)
        return m(recurse, f)
      } else {
        return next(f, desc)
      }
    }
    return go(ms, f, desc)
  }

export const tapeExecutor = (tape: Middleware) => (next, f, desc) => new Promise((resolve, reject) => {
  if (f.length !== 3) {
    reject("tapeMiddleware requires scenario functions to take 3 arguments, please check your scenario definitions.")
  }
  tape(desc, t => {
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