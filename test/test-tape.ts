const sinon = require('sinon')
const test = require('tape')

import { Orchestrator } from '../src/orchestrator'
import { tapeExecutor } from '../src/middleware'
import { genConfig, spawnConductor } from './common'

const orchestrator = new Orchestrator({
  spawnConductor, genConfig,
  middleware: tapeExecutor(test)
})

const testRan = sinon.spy()

let resume: any = null
const pauser = new Promise(resolve => (resume = resolve))

orchestrator.registerScenario('test scenario #1', async (s, t) => {
  // await pauser
  t.equal(typeof s.initialize, 'function')
  testRan(1)
})

orchestrator.registerScenario('test scenario #2', async (s, t) => {
  t.equal(typeof s.initialize, 'function')
  testRan(2)
})

orchestrator.run()

test("Double-check that tapeExecutor test ran", t => {
  t.equal(testRan.callCount, 2)
  t.end()
})