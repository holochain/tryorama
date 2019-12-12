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

  test('late joiners', async t => {
    const C = testConfig()
    const orchestrator = testOrchestrator()
    orchestrator.registerScenario('attempted call with unspawned conductor', async s => {
      const { alice } = await s.players({ alice: C.alice }, true)

      const commit1 = await alice.call('app', 'main', 'commit_entry', {
        content: 'content'
      })
      const commit2 = await alice.call('app', 'main', 'commit_entry', {
        content: 'content'
      })
      const hash1 = commit1.Ok
      const hash2 = commit2.Ok

      const linkResult = await alice.call('app', 'main', 'link_entries', {
        base: hash1,
        target: hash2,
      })
      const linkHash = linkResult.Ok
      await s.consistency()

      // bob and carol join later
      const { bob, carol } = await s.players({ bob: C.bob, carol: C.carol }, true)

      // after the consistency waiting inherent in auto-spawning the new players, their state dumps
      // should immediately show that they are holding alice's entries
      const bobDump = await bob.stateDump('app')
      const carolDump = await bob.stateDump('app')

      t.ok(hash1 in bobDump.held_aspects)
      t.ok(hash2 in bobDump.held_aspects)
      t.ok(linkHash in bobDump.held_aspects)
      t.ok(hash1 in carolDump.held_aspects)
      t.ok(hash2 in carolDump.held_aspects)
      t.ok(linkHash in carolDump.held_aspects)

      const bobLinks = await bob.call('app', 'main', 'get_links', {
        base: hash1
      })
      const carolLinks = await carol.call('app', 'main', 'get_links', {
        base: hash1
      })

      t.equal(bobLinks.Ok.links.length, 1)
      t.equal(carolLinks.Ok.links.length, 1)
    })

    const stats = await orchestrator.run()

    t.equal(stats.successes, 1)
    t.end()
  })

}
