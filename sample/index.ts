const path = require('path')
const tape = require('tape')
const { Playbook } = require('../src')

const dnaPath = path.join(__dirname, "../../holochain-rust/app_spec/dist/app_spec.dna.json")
const dnaBlog = Playbook.dna(dnaPath, 'blog')

// TODO: need the function that actually RUNs the damn thing,
// not the thing that registers the thing, inside the combinator.
const withTape = tape => (desc, f) => {
  const g = (s, instances) => {
    console.log('!!! calling all tape')
    tape(desc, async t => {
      try {
        console.log()
        console.log("<<<<<<<<<< now test begins <<<")
        console.log("<<<<<<<<<< now test begins <<<")
        console.log("<<<<<<<<<< now test begins <<<")
        console.log()
        await f(s, t, instances)
        console.log()
        console.log(">>> now test over >>>>>>>>>>>>")
        console.log(">>> now test over >>>>>>>>>>>>")
        console.log(">>> now test over >>>>>>>>>>>>")
        console.log()
        t.end()
      } catch (e) {
        console.error("Problem with test: ", e)
        t.fail(e)
      }
    })
  }
  return g
}

const playbook = new Playbook({
  instances: {
    alice: dnaBlog,
    bob: dnaBlog,
    carol: dnaBlog,
  },
  debugLog: true,
  middleware: [
    // withTape(require('tape'))
  ]
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

require('./test-tape-manual')(scenario, tape)

playbook.runSuite().then(() => {
  console.log("all done!!")
  playbook.close()
})
