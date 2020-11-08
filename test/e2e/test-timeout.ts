const sinon = require('sinon')
const test = require('tape')

import { Orchestrator, Config } from '../../src'
import { runSeries } from '../../src/middleware'
import { delay } from '../../src/util'


module.exports = (testOrchestrator, testConfig) => {

  test('test ends properly on hachiko strict timeout', async t => {
    const C = testConfig()
    const orchestrator = await testOrchestrator({
      waiter: {
        hardTimeout: 1000,
        strict: true,
      }
    })
    orchestrator.registerScenario('test ends properly on hachiko strict timeout', async s => {
      const players = await s.players({ alice: C.players.alice, bob: C.players.bob }, C.initialization)
      const { alice } = players

      alice.onSignal({
        instanceId: 'app',
        signal: {
          signal_type: 'Consistency',
          event: 'a',
          pending: [
            {event: 'b', group: 'Source'}
          ]
        }
      })
      await s.consistency()
    })
    const stats = await orchestrator.run()
    t.equal(stats.successes, 0)
    t.equal(stats.errors.length, 1)
    t.ok(stats.errors[0].error.match(/hachiko timeout/))
    t.end()
  })

}
