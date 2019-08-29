const sinon = require('sinon')
const test = require('tape')

import { Orchestrator, Config } from '../../src'
import { genConfigArgs, spawnConductor } from '../common'

test('Player can be created', async t => {
  const orchestrator = new Orchestrator({ spawnConductor, genConfigArgs })
  const config = {
    instances: {
      app: Config.dna('path/to/dna.json')
    }
  }
  orchestrator.registerScenario('test 1', async s => {
    const [player] = await s.conductors([config])
    await player.spawn()
    await player.kill()
    await player.spawn()
  })
  const stats = await orchestrator.run()
  t.equal(stats.errors.length, 0, stats.errors)
  t.end()
})
