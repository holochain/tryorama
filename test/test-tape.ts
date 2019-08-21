const sinon = require('sinon')
const test = require('tape')

import { Orchestrator } from '../src/orchestrator'
import { tapeExecutor } from '../src/middleware'
import { genConfig, spawnConductor } from './common'
import logger from '../src/logger';

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

orchestrator.registerScenario('function signature check', async (s, t, x) => {})

orchestrator.run().then(stats => {
  const valid = 
    testRan.firstCall.calledWith(1) 
    && testRan.secondCall.calledWith(2)
    && stats.errors[0].includes('2 arguments')
  if (!valid) {
    logger.error("tape tests are broken!")
    process.exit(-1)
  }
})
