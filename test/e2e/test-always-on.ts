import * as tape from 'tape'
import test from 'tape-promise/tape'
import path from 'path'

import { ScenarioApi } from '../../src/api';
import { Config } from '../../src'
import * as T from '../../src/types'

export default (testOrchestrator, testConfig, playersFn = (s, ...args) => s.players(...args)) => {

  test('test with error', async t => {
    t.plan(2)
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

  test('test with simple zome call and assigned appPort', async t => {
    t.plan(3)
    const [conductorConfig, installApps] = testConfig()
    const orchestrator = await testOrchestrator()
    orchestrator.registerScenario('simple zome call', async (s: ScenarioApi) => {
      const seed: T.ConfigSeed = Config.gen({
        network: {
          network_type: T.NetworkType.QuicBootstrap,
          transport_pool: [{
            type: T.TransportConfigType.Quic,
          }],
        },
        appPort: 6000
      }
      )
      const [alice] = await playersFn(s, [seed])
      const [[alice_happ]] = await alice.installAgentsHapps(installApps)
      const hash = await alice_happ.cells[0].call('test', 'create_link')
      t.equal(hash.length, 39, 'zome call succeeded')
    })
    const stats = await orchestrator.run()
    t.equal(stats.successes, 1, 'only success')
    t.equal(stats.errors.length, 0, 'no errors')
    console.log(stats)
    t.end()
  })

  test('test installAgentsHapps', async t => {
    t.plan(3)
    const [conductorConfig, _installApp] = testConfig()
    const dnaPath = _installApp[0][0][0] // bleah
    const orchestrator = await testOrchestrator()
    orchestrator.registerScenario('installAgentsHapps correctly shares agentPubKey', async (s: ScenarioApi) => {
      const [alice] = await playersFn(s, [conductorConfig])
      const installAppsOverride = [ [[dnaPath]] ]
      // agent 0
      const [ [happ1] ] = await alice.installAgentsHapps(installAppsOverride)
      // agent 1
      const [ [happ2] ] = await alice.installAgentsHapps(installAppsOverride)
      // "agent 0" and "agent 1" are in fact different
      t.notDeepEqual(happ1.agent, happ2.agent)
    })
    const stats = await orchestrator.run()
    t.equal(stats.successes, 1, 'only success')
    t.equal(stats.errors.length, 0, 'no errors')
    console.log(stats)
    t.end()
  })

  test('test with happ bundles', async t => {
    t.plan(3)
    const [conductorConfig, _installApps] = testConfig()
    const orchestrator = await testOrchestrator()
    orchestrator.registerScenario('installBundledHapp', async (s: ScenarioApi) => {
      const [alice] = await playersFn(s, [conductorConfig])
      const bundlePath = path.join(__dirname, 'fixture', 'test.happ')
      const alice_happ = await alice.installBundledHapp({path: bundlePath})
      const hash = await alice_happ.cells[0].call('test', 'create_link')
      t.equal(hash.length, 39, 'zome call succeeded')
    })
    const stats = await orchestrator.run()
    t.equal(stats.successes, 1, 'only success')
    t.equal(stats.errors.length, 0, 'no errors')
    console.log(stats)
    t.end()
  })

  test('test with happ bundles including installed_app_id', async t => {
    t.plan(3)
    const [conductorConfig, _installApps] = testConfig()
    const orchestrator = await testOrchestrator()
    orchestrator.registerScenario('installBundledHapp', async (s: ScenarioApi) => {
      const [alice] = await playersFn(s, [conductorConfig])
      const bundlePath = path.join(__dirname, 'fixture', 'test.happ')
      const installedAppId = 'test-id'
      const alice_happ = await alice.installBundledHapp({ path: bundlePath }, null, installedAppId)
      const hash = await alice_happ.cells[0].call('test', 'create_link')
      t.equal(hash.length, 39, 'zome call succeeded')
    })
    const stats = await orchestrator.run()
    t.equal(stats.successes, 1, 'only success')
    t.equal(stats.errors.length, 0, 'no errors')
    console.log(stats)
    t.end()
  })
}
