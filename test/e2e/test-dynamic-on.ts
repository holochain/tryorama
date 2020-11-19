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
      const linkResult = await alice_happ.cells[0].call('link', 'create_link')

      // bob and carol join later
      const [bob, carol] = await s.players([conductorConfig, conductorConfig])
      const [[bob_happ]] = await bob.installAgentsHapps(installApps)
      const [[carol_happ]] = await carol.installAgentsHapps(installApps)
      const bobLinks = await bob_happ.cells[0].call('link', 'get_links')
      const carolLinks = await carol_happ.cells[0].call('link', 'get_links')
      // TODO: re-enable when multiple conductors can
      // talk to each other
      // t.equal(bobLinks.links.length, 1)
      // t.equal(carolLinks.links.length, 1)
    })

    const stats = await orchestrator.run()

    t.equal(stats.successes, 1)
    t.end()
  })

}
