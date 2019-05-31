import * as colors from 'colors'


export const simpleExecutor = (run, f, desc) => {
  console.log(colors.yellow(`§`), colors.yellow.underline(`desc`))
  run(f)
}

export const tapeExecutor = tape => (run, f, desc) => new Promise((resolve, reject) => {
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
