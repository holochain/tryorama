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
      const [[alice_happ]] = await alice.installAgentsHapps(C.initialization)
      const link_cell = alice_happ.cells[0]
      await t.doesNotReject(
        link_cell.call('link', 'create_link', undefined)
      )

      await alice.shutdown()

      await t.rejects(
        link_cell.call('link', 'create_link', undefined)
        /* no conductor is running.*/
      )
    })

    orchestrator.registerScenario('start-stop-start', async s => {
      const [ alice ] = await s.players([C.players.alice], false)
      await alice.startup()
      const [[alice_happ]] = await alice.installAgentsHapps(C.initialization)
      await alice.shutdown()
      await alice.startup()
      const link_cell = alice_happ.cells[0]
      const agentAddress = await link_cell.call('link', 'create_link', undefined)

      t.equal(agentAddress.Ok.length, 46)
    })

    const stats = await orchestrator.run()

    t.equal(stats.successes, 2)
  })

  test('late joiners', async t => {
    const C = testConfig()
    const orchestrator = testOrchestrator()
    orchestrator.registerScenario('attempted call with unspawned conductor', async s => {
      const [ alice ] = await s.players([C.players.alice])
      const [[alice_happ]] = await alice.installAgentsHapps(C.initialization)

      const alice_cell = alice_happ.cells[0]

      const linkResult = await alice_cell.call('link', 'create_link', undefined)

      const linkHash = linkResult.Ok
      //await s.consistency()

      // bob and carol join later
      const [ bob, carol ] = await s.players([C.players.bob, C.players.carol ])
      const [[bob_happ]] = await bob.installAgentsHapps(C.initialization)
      const [[carol_happ]] = await carol.installAgentsHapps(C.initialization)

      // after the consistency waiting inherent in auto-spawning the new players, their state dumps
      // should immediately show that they are holding alice's entries
      // FIXME stateDump
//      const bobDump = await bob.stateDump('app')
//      const carolDump = await bob.stateDump('app')

      // FIXME
/*      t.ok(hash1 in bobDump.held_aspects)
      t.ok(hash2 in bobDump.held_aspects)
      t.ok(linkHash in bobDump.held_aspects)
      t.ok(hash1 in carolDump.held_aspects)
      t.ok(hash2 in carolDump.held_aspects)
      t.ok(linkHash in carolDump.held_aspects)
*/
      const bobLinks = await bob_happ.cells[0].call('link', 'get_links', undefined)
      const carolLinks = await carol_happ.cells[0].call('link', 'get_links', undefined)

      t.equal(bobLinks.Ok.links.length, 1)
      t.equal(carolLinks.Ok.links.length, 1)
    })

    const stats = await orchestrator.run()

    t.equal(stats.successes, 1)
    t.end()
  })

}
