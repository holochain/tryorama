import * as colors from 'colors'

import {ScenarioFn} from './types'

type Runner = (ScenarioFn) => Promise<void>

export const simpleExecutor = (run: Runner, f, desc) => {
  console.log(colors.yellow(`§`), colors.yellow.underline(`desc`))
  run(f)
}

export const tapeExecutor = tape => (run: Runner, f, desc) => new Promise((resolve, reject) => {
  if (f.length !== 3) {
    reject("tapeMiddleware requires scenario functions to take 3 arguments, please check your scenario definitions.")
  }
  tape(desc, t => {
    run((s, conductors) => f(s, t, conductors))
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
