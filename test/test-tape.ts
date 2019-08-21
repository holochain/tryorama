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

orchestrator.registerScenario('test scenario 1', async (s, t) => {
  t.equal(typeof s.initialize, 'function')
  testRan()
})

orchestrator.run()

test("Double-check that tapeExecutor test ran", t => {
  t.equal(testRan.callCount, 1)
  t.end()
})