const sinon = require('sinon')
const test = require('tape')

import { Orchestrator } from '../../src'
import { tapeExecutor, combine } from '../../src/middleware'
import { genConfigArgs, spawnConductor } from '../common'
import logger from '../../src/logger';
import { delay } from '../../src/util';

const orchestrator = new Orchestrator({
  // NB: once, combine caused middleware to only be applied to the first test!
  // keep this in here.
  middleware: combine(tapeExecutor(test))
})

const testRan = sinon.spy()


orchestrator.registerScenario('real tape scenario #1', async (s, t) => {
  await delay(500)
  t.equal(typeof s.players, 'function')
  testRan(1)
})

orchestrator.registerScenario('real tape scenario #2', async (s, t) => {
  t.equal(typeof s.players, 'function')
  testRan(2)
})

orchestrator.run().then(stats => {
  const valid =
    stats.successes === 2
    && testRan.firstCall.calledWith(1)
    && testRan.secondCall.calledWith(2)
  if (!valid) {
    logger.error("Real tape tests are broken! Please fix them.")
    process.exit(-1)
  }
})
