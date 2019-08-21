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

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

orchestrator.registerScenario('test scenario #1', async (s, t) => {
  await delay(1000)
  t.equal(typeof s.initialize, 'function')
  testRan(1)
})

orchestrator.registerScenario('test scenario #2', async (s, t) => {
  t.equal(typeof s.initialize, 'function')
  testRan(2)
})

orchestrator.run().then(num => {
  const valid = 
    num === testRan.callCount 
    && testRan.firstCall.calledWith(1) 
    && testRan.secondCall.calledWith(2)
  if (!valid) {
    throw new Error("tape tests are broken!")
  }
})
