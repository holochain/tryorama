import * as tape from 'tape'
import test from 'tape-promise/tape'


import { Orchestrator, Config, InstallAgentsHapps } from '../../src'
import { delay, trace } from '../../src/util';

module.exports = (testOrchestrator, testConfig) => {

  test('test with shutdown and startup', async t => {
    const [aliceConfig, installApps] = testConfig()
    const orchestrator = testOrchestrator()

    orchestrator.registerScenario('attempted call with stopped conductor', async s => {
      const [alice] = await s.players([aliceConfig], false)
      await alice.startup()
      const [[alice_happ]] = await alice.installAgentsHapps(installApps)
      const [link_cell] = alice_happ.cells
      await t.doesNotReject(
        link_cell.call('link', 'create_link')
      )
      await alice.shutdown()
      await t.rejects(
        link_cell.call('link', 'create_link')
        /* no conductor is running.*/
      )
    })

    orchestrator.registerScenario('start-stop-start', async s => {
      const [alice] = await s.players([aliceConfig], false)
      await alice.startup()
      const [[alice_happ]] = await alice.installAgentsHapps(installApps)
      await alice.shutdown()
      await alice.startup()
      const agentAddress = await alice_happ.cells[0].call('link', 'create_link')
      t.equal(agentAddress.length, 39)
    })

    const stats = await orchestrator.run()

    t.equal(stats.successes, 2)
    t.end()
  })

  test('late joiners', async t => {
    const [conductorConfig, installApps] = testConfig()
    const orchestrator = testOrchestrator()

    orchestrator.registerScenario('other agents join after an initial one', async s => {
      const [ alice ] = await s.players([conductorConfig])
      const [[alice_happ]] = await alice.installAgentsHapps(installApps)
      var aliceLinks = await alice_happ.cells[0].call('link', 'get_links')
      t.equal(aliceLinks.length, 0)
      const linkResult = await alice_happ.cells[0].call('link', 'create_link')
      aliceLinks = await alice_happ.cells[0].call('link', 'get_links')
      t.equal(aliceLinks.length, 1)

      // bob and carol join later
      const [bob, carol] = await s.players([conductorConfig, conductorConfig])
      const [[bob_happ]] = await bob.installAgentsHapps(installApps)
      const [[carol_happ]] = await carol.installAgentsHapps(installApps)

      // now use admin node injection so all the conductors know about each-other
      const r = await s.shareAllNodes([alice, bob, carol])
      // allow 1 second for gossiping
      await delay(1000)

      // confirm that bob and carol have the links
      const bobLinks = await bob_happ.cells[0].call('link', 'get_links')
      const carolLinks = await carol_happ.cells[0].call('link', 'get_links')
      //t.fail(JSON.stringify(carolLinks))
      t.equal(bobLinks.length, 1)
      t.equal(carolLinks.length, 1)
    })

    const stats = await orchestrator.run()

    t.equal(stats.successes, 1)
    t.end()
  })

}
