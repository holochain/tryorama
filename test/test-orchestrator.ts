const sinon = require('sinon')
const test = require('tape')

import { Orchestrator } from '../src/orchestrator'
import { genConfig, spawnConductor } from './common'

test('Scenario API constructed properly', async t => {
  t.plan(3)
  const orchestrator = new Orchestrator({ spawnConductor, genConfig })
  orchestrator.registerScenario('test scenario 1', async s => {
    t.equal(s.description, 'test scenario 1')
    t.equal(typeof s.initialize, 'function')
    t.equal(typeof s.consistency, 'function')
  })
  orchestrator.run()
})
