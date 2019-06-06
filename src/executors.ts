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
    run((s, ins) => f(s, t, ins))
      .catch((e) => {
        t.fail(e)
      })
      .finally(() => {
        t.end()
        resolve()
      })
  })
})
