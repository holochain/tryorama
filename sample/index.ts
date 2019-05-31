// TODO
// Bring all samples back up to date!!

const path = require('path')
const tape = require('tape')
const { Playbook, simpleMiddleware, tapeMiddleware } = require('../src')

const dnaPath = path.join(__dirname, "../../holochain-rust/app_spec/dist/app_spec.dna.json")
const dnaBlog = Playbook.dna(dnaPath, 'blog')


const playbook = new Playbook({
  instances: {
    alice: dnaBlog,
    bob: dnaBlog,
    carol: dnaBlog,
  },
  debugLog: true,
  middleware: [
    tapeMiddleware(require('tape')),
    // simpleMiddleware,
  ],
  // immediate: true,
})

process.on('unhandledRejection', error => {
  // Will print "unhandledRejection err is not defined"
  console.error('got unhandledRejection:', error);
});


const assert = x => {
  if (!x) {
    throw "assertion error!"
  }
}


// const scenario = withTape(require('tape'))(playbook.scenario)
const scenario = playbook.registerScenario

require('./test-tape-combinator')(scenario)
// require('./test-tape-manual')(scenario, tape)
// require('./test-vanilla')(scenario)
// require('./test-simple')(scenario)

playbook.runSuite().then(() => {
  console.log("all done!!")
  playbook.close()
})
