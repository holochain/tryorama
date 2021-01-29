import * as tape from 'tape'
import test from 'tape-promise/tape'

import { ScenarioApi } from '../../src/api';

export default (testOrchestrator, testConfig, playersFn = (s, ...args) => s.players(...args)) => {

  test('test with error', async t => {
    const [conductorConfig, _installApps] = testConfig()
    const orchestrator = await testOrchestrator()
    orchestrator.registerScenario('call for conductor after shutdown', async (s: ScenarioApi) => {
      const [alice] = await playersFn(s, [conductorConfig])
      await alice.shutdown()
      // this will throw
      alice.adminWs()
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
      const [alice] = await playersFn(s, [conductorConfig])
      const [[alice_happ]] = await alice.installAgentsHapps(installApps)
      const hash = await alice_happ.cells[0].call('test', 'create_link')
      t.equal(hash.length, 39, 'zome call succeeded')
    })
    const stats = await orchestrator.run()
    t.equal(stats.successes, 1, 'only success')
    t.equal(stats.errors.length, 0, 'no errors')
    console.log(stats)
  })

  test('test installAgentsHapps', async t => {
    t.plan(5)
    const [conductorConfig, _installApp] = testConfig()
    const orchestrator = await testOrchestrator()
    orchestrator.registerScenario('installAgentsHapps correctly shares agentPubKey', async (s: ScenarioApi) => {
      const [alice] = await playersFn(s, [conductorConfig])
      const installAppsOverride = [
        // agent 0
        [[], []],
        // agent 1
        [[], []]
      ]
      // note that hApps can still be installed
      // without any DNAs in them
      const [
        [happ1, happ2],
        [happ3, happ4]
      ] = await alice.installAgentsHapps(installAppsOverride)

      // happ1 and happ2 share "agent 0"
      t.deepEqual(happ1.agent, happ2.agent)
      // happ3 and happ4 share "agent 1"
      t.deepEqual(happ3.agent, happ4.agent)
      // "agent 0" and "agent 1" are in fact different
      t.notDeepEqual(happ1.agent, happ3.agent)
    })
    const stats = await orchestrator.run()
    t.equal(stats.successes, 1, 'only success')
    t.equal(stats.errors.length, 0, 'no errors')
    console.log(stats)
  })
}
