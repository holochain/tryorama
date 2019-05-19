const path = require('path')
const tape = require('tape')
const { Playbook } = require('../src')

const dnaPath = path.join(__dirname, "../../holochain-rust/app_spec/dist/app_spec.dna.json")
const dnaBlog = Playbook.dna(dnaPath, 'blog')

// TODO: need the function that actually RUNs the damn thing,
// not the thing that registers the thing, inside the combinator.
const withTape = tape => (run, f, desc) => () => new Promise(resolve => {
  tape(desc, t => {
    run((s, ins) => f(s, t, ins)).then(() => {
      t.end()
      resolve()
    })
  })
})

const simpleMiddleware = (run, f, desc) => {
  return () => run(f)
}

const playbook = new Playbook({
  instances: {
    alice: dnaBlog,
    bob: dnaBlog,
    carol: dnaBlog,
  },
  debugLog: true,
  middleware: [
    simpleMiddleware
    // withTape(require('tape'))
  ],
  // immediate: true,
})

process.on('unhandledRejection', error => {
  // Will print "unhandledRejection err is not defined"
  console.error('unhandledRejection', error);
});

// const withHarness = harness => run => async (desc, g) => {
//   // inject `harness` as the second parameter
//   const f = (s, instances) => g(s, harness, instances)
//   return run(desc, f)
// }

const assert = x => {
  if (!x) {
    throw "assertion error!"
  }
}


// const scenario = withTape(require('tape'))(playbook.scenario)
const scenario = playbook.registerScenario

// require('./test-tape-manual')(scenario, tape)
// require('./test-vanilla')(scenario)
require('./test-simple')(scenario)

playbook.runSuite().then(() => {
  console.log("all done!!")
  playbook.close()
})
