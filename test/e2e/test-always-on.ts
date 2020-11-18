import * as tape from 'tape'
import test from 'tape-promise/tape'

import { ScenarioApi } from '../../src/api';

module.exports = (testOrchestrator, testConfig) => {

  test('test with error', async t => {
    const [conductorConfig, _installApps] = testConfig()
    const orchestrator = await testOrchestrator()
    orchestrator.registerScenario('call for conductor after shutdown', async (s: ScenarioApi) => {
      const [alice] = await s.players([conductorConfig])
      await alice.shutdown()
      // this will throw
      alice.admin()
    })
    console.debug('registered scenario.')
    const stats = await orchestrator.run()
    console.debug('orchestrator runs')
    t.equal(stats.successes, 0)
    t.equal(stats.errors.length, 1)
    console.log(stats)
    // t.ok(stats.errors[0].error.message.match(/instance identifier invalid.*/)) // FIXME
    t.end()
  })

  test('test with simple zome call', async t => {
    t.plan(3)
    const [conductorConfig, installApps] = testConfig()
    const orchestrator = await testOrchestrator()
    orchestrator.registerScenario('simple zome call', async (s: ScenarioApi) => {
      const [alice] = await s.players([conductorConfig])
      const [[alice_happ]] = await alice.installAgentsHapps(installApps)
      const hash = await alice_happ.cells[0].call('link', 'create_link')
      t.equal(hash.length, 39, 'zome call succeeded')
    })
    const stats = await orchestrator.run()
    t.equal(stats.successes, 1, 'only success')
    t.equal(stats.errors.length, 0, 'no errors')
    console.log(stats)
  })

  // test('test with consistency awaiting', async t => {
  //   t.plan(5)
  //   const [conductorConfig, installApps] = testConfig()
  //   const orchestrator = await testOrchestrator()
  //   orchestrator.registerScenario('zome call with consistency', async s => {
  //     const { alice, bob } = await s.players({ alice: C.players.alice, bob: C.players.bob }, C.initialization)

  //     // TODO: this sometimes does not properly await...
  //     await s.consistency()

  //     // ... i.e., sometimes this fails with "base for link not found"
  //     const baseHash = await alice.call('app', 'app:cell', 'main', 'commit_entry', { content: 'base' }).then(x => x.Ok)
  //     const targetHash = await alice.call('app', 'app:cell', 'main', 'commit_entry', { content: 'target' }).then(x => x.Ok)
  //     t.equal(baseHash.length, 46, 'alice creates base')
  //     t.equal(targetHash.length, 46, 'alice creates target')
  //     await s.consistency()

  //     const messageResult = await alice.call('app', 'app:cell', 'main', 'link_entries', {
  //       base: baseHash,
  //       target: targetHash,
  //     })
  //     await s.consistency()

  //     const links = await bob.call('app', 'app:cell', 'main', 'get_links', { base: baseHash }).then(x => x.Ok)
  //     t.ok(links, 'bob gets links')
  //     // TODO: have bob check that he can see alice's stream
  //   })
  //   const stats = await orchestrator.run()
  //   t.equal(stats.successes, 1)
  //   t.equal(stats.errors.length, 0)
  // })

}
