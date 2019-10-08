import * as tape from 'tape'
import tapeP from 'tape-promise'

const test = tapeP(tape)

import { Orchestrator, Config } from '../../src'
import { runSeries } from '../../src/middleware'
import { delay } from '../../src/util';
import { testConfig } from './common';


const testOrchestrator = () => new Orchestrator({
  middleware: runSeries,
  reporter: true,
})

test('test with kill and respawn', async t => {
  t.plan(4)
  const C = testConfig()
  const orchestrator = testOrchestrator()
  orchestrator.registerScenario('attempted call with killed conductor', async s => {
    const { alice } = await s.players({ alice: C.alice })
    await alice.spawn()

    await t.doesNotReject(
      alice.call('chat', 'chat', 'register', {
        name: 'alice',
        avatar_url: 'https://tinyurl.com/yxcwavlr',
      })
    )

    await alice.kill()

    await t.rejects(
      alice.call('chat', 'chat', 'register', {
        name: 'alice',
        avatar_url: 'https://tinyurl.com/yxcwavlr',
      }),
      /.*no conductor is running.*/
    )

  })

  orchestrator.registerScenario('spawn-kill-spawn', async s => {
    const { alice } = await s.players({ alice: C.alice })
    await alice.spawn()
    await alice.kill()
    await alice.spawn()
    const agentAddress = await alice.call('chat', 'chat', 'register', {
      name: 'alice',
      avatar_url: 'https://tinyurl.com/yxcwavlr',
    })
    t.equal(agentAddress.Ok.length, 63)
  })
  const stats = await orchestrator.run()
  t.equal(stats.successes, 1)
  t.equal(stats.errors.length, 1)
})

