

export const simpleMiddleware = (run, f, desc) => () => run(f)
simpleMiddleware.isTerminal = true


export const tapeMiddleware = tape => {
  const m = (run, f, desc) => () => new Promise((resolve, reject) => {
    if (f.length !== 3) {
      reject("tapeMiddleware requires scenario functions to take 3 arguments, please check your scenario definitions.")
    }
    tape(desc, t => {
      run((s, ins) => f(s, t, ins)).then(() => {
        t.end()
        resolve()
      })
    })
  })
  m.isTerminal = true
  return m
}
