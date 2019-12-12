import * as tape from 'tape'
import tapeP from 'tape-promise'

const test = tapeP(tape)

import { Orchestrator, Config } from '../../src'
import { runSeries } from '../../src/middleware'
import { delay, trace } from '../../src/util';

module.exports = (testOrchestrator, testConfig) => {

  test('test with kill and respawn', async t => {
    t.plan(4)
    const C = testConfig()
    const orchestrator = testOrchestrator()
    orchestrator.registerScenario('attempted call with killed conductor', async s => {
      const { alice } = await s.players({ alice: C.alice })
      await alice.spawn()

      await t.doesNotReject(
        alice.call('app', 'main', 'commit_entry', {
          content: 'content'
        })
      )

      await alice.kill()

      await t.rejects(
        alice.call('app', 'main', 'commit_entry', {
          content: 'content'
        }),
        /.*no conductor is running.*/
      )
    })

    orchestrator.registerScenario('spawn-kill-spawn', async s => {
      const { alice } = await s.players({ alice: C.alice })
      await alice.spawn()
      await alice.kill()
      await alice.spawn()
      const agentAddress = await alice.call('app', 'main', 'commit_entry', {
        content: 'content'
      })
      t.equal(agentAddress.Ok.length, 46)
    })

    const stats = await orchestrator.run()

    t.equal(stats.successes, 2)
  })

  test('test with no conductor', async t => {
    const C = testConfig()
    const orchestrator = testOrchestrator()
    orchestrator.registerScenario('attempted call with unspawned conductor', async s => {
      const { alice } = await s.players({ alice: C.alice })
      await alice.call('app', 'main', 'commit_entry', {
        content: 'content'
      })
    })

    const stats = await orchestrator.run()

    t.equal(stats.errors.length, 1)
  })

}
