const sinon = require('sinon')
const test = require('tape')

import { Orchestrator } from '../src/orchestrator'
import { genConfig, spawnConductor } from './common'

test('Actor can be created', async t => {
  const orchestrator = new Orchestrator({ spawnConductor, genConfig })
  const config = {}
  orchestrator.registerScenario('test 1', async s => {
    const [actor] = await s.initialize([config])
    actor.start()
    actor.kill()
    actor.start()
  })
  const stats = await orchestrator.run()
  t.equal(stats.errors.length, 0, stats.errors)
  t.end()
})
