import * as tape from 'tape'
import test from 'tape-promise/tape'


import { Orchestrator, Config, InstallAgentsHapps } from '../../src'
import { delay, trace } from '../../src/util';

module.exports = (testOrchestrator, testConfig) => {

  test('test with shutdown and startup', async t => {
    t.plan(4)
    const C = testConfig()
    const orchestrator = testOrchestrator()
    orchestrator.registerScenario('attempted call with stopped conductor', async s => {
      const [ alice ] = await s.players([C.players.alice], false)
      await alice.startup()
      const [alice_happ] = await alice.installAgentsHapps(C.initialization)

      await t.doesNotReject(
        alice_happ.cells[0].call('main', 'commit_entry', {
          content: 'content'
        })
      )

      await alice.shutdown()

      await t.rejects(
        alice_happ.cells[0].call('main', 'commit_entry', {
          content: 'content'
        })
        /* no conductor is running.*/
      )
    })

    orchestrator.registerScenario('start-stop-start', async s => {
      const [ alice ] = await s.players([C.players.alice], false)
      await alice.startup()
      const [alice_happ] = await alice.installAgentsHapps(C.initialization)
      await alice.shutdown()
      await alice.startup()
      const agentAddress = await alice_happ.cells[0].call('main', 'commit_entry', {
        content: 'content'
      })
      t.equal(agentAddress.Ok.length, 46)
    })

    const stats = await orchestrator.run()

    t.equal(stats.successes, 2)
  })

  test.skip('late joiners', async t => {
    const C = testConfig()
    const orchestrator = testOrchestrator()
    orchestrator.registerScenario('attempted call with unspawned conductor', async s => {
      const [ alice ] = await s.players([C.players.alice])
      const [alice_happ] = await alice.installAgentsHapps(C.initialization)

      const [alice_cell] = alice_happ.cells[0]

      const commit1 = await alice_cell.call('main', 'commit_entry', {
        content: 'content1'
      })
      const commit2 = await alice_cell.call('main', 'commit_entry', {
        content: 'content2'
      })
      const hash1 = commit1.Ok
      const hash2 = commit2.Ok

      const linkResult = await alice_cell.call('main', 'link_entries', {
        base: hash1,
        target: hash2,
      })
      const linkHash = linkResult.Ok
      await s.consistency()

      // bob and carol join later
      const [ bob, carol ] = await s.players([C.players.bob, C.players.carol ])
      const [bob_happ] = await bob.installAgentsHapps(C.initialization)
      const [carol_happ] = await carol.installAgentsHapps(C.initialization)

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

      const bobLinks = await bob_happ.cells[0].call('main', 'get_links', {
        base: hash1
      })
      const carolLinks = await carol_happ.cells[0].call('main', 'get_links', {
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
