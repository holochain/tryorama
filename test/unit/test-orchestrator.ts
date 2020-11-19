const test = require('tape')

import { testOrchestrator } from '../common'

test('Scenario API constructed properly', async t => {
  t.plan(2)
  const orchestrator = testOrchestrator()
  orchestrator.registerScenario('test scenario 1', async s => {
    t.equal(s.description, 'test scenario 1')
    t.equal(typeof s.players, 'function')
  })
  orchestrator.run()
})
