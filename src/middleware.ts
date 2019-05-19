

export const simpleMiddleware = (run, f, desc) => () => run(f)
simpleMiddleware.isTerminal = true


export const tapeMiddleware = tape => {
  const m = (run, f, desc) => () => new Promise(resolve => {
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
