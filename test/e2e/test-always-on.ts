import * as tape from 'tape'
import tapeP from 'tape-promise'

const test = tapeP(tape)

import { Orchestrator, Config } from '../../src'
import { runSeries } from '../../src/middleware'
import { delay, trace } from '../../src/util';

module.exports = (testOrchestrator, testConfig) => {

  test('test with error', async t => {
    const C = testConfig()
    const orchestrator = await testOrchestrator()
    orchestrator.registerScenario('invalid instance', async s => {
      const players = await s.players({ alice: C.alice }, true)
      const { alice } = players
      await alice.call('blah', 'blah', 'blah', 'blah')
    })
    console.debug('registered scenario.')
    const stats = await orchestrator.run()
    console.debug('orchestrator runs')
    t.equal(stats.successes, 0)
    t.equal(stats.errors.length, 1)
    console.log(stats)
    t.ok(stats.errors[0].error.message.match(/instance identifier invalid.*/))
    t.end()
  })

  test('test with simple zome call', async t => {
    t.plan(3)
    const C = testConfig()
    const orchestrator = await testOrchestrator()
    orchestrator.registerScenario('simple zome call', async s => {
      const players = await s.players({ alice: C.alice }, true)
      const { alice } = players
      const hash = await alice.call('app', 'main', 'commit_entry', { content: 'content' }).then(x => x.Ok)
      t.equal(hash.length, 46, 'zome call succeeded')
    })
    const stats = await orchestrator.run()
    t.equal(stats.successes, 1, 'only success')
    t.equal(stats.errors.length, 0, 'no errors')
    console.log(stats)
  })

  test('test with simple zome call via instance', async t => {
    t.plan(3)
    const C = testConfig()
    const orchestrator = await testOrchestrator()
    orchestrator.registerScenario('simple zome call', async s => {
      const players = await s.players({ alice: C.alice }, true)
      const { alice } = players
      const instance = alice.instance('app')
      const hash = await instance.call('main', 'commit_entry', { content: 'content' }).then(x => x.Ok)
      t.equal(hash.length, 46, 'zome call succeeded')
    })
    const stats = await orchestrator.run()
    t.equal(stats.successes, 1, 'only success')
    t.equal(stats.errors.length, 0, 'no errors')
    console.log(stats)
  })

  test('test with consistency awaiting', async t => {
    t.plan(5)
    const C = testConfig()
    const orchestrator = await testOrchestrator()
    orchestrator.registerScenario('zome call with consistency', async s => {
      const { alice, bob } = await s.players({ alice: C.alice, bob: C.bob }, true)

      // TODO: this sometimes does not properly await...
      await s.consistency()

      // ... i.e., sometimes this fails with "base for link not found"
      const baseHash = await alice.call('app', 'main', 'commit_entry', { content: 'base' }).then(x => x.Ok)
      const targetHash = await alice.call('app', 'main', 'commit_entry', { content: 'target' }).then(x => x.Ok)
      t.equal(baseHash.length, 46, 'alice creates base')
      t.equal(targetHash.length, 46, 'alice creates target')
      await s.consistency()

      const messageResult = await alice.call('app', 'main', 'link_entries', {
        base: baseHash,
        target: targetHash,
      })
      await s.consistency()

      const links = await bob.call('app', 'main', 'get_links', { base: baseHash }).then(x => x.Ok)
      t.ok(links, 'bob gets links')
      // TODO: have bob check that he can see alice's stream
    })
    const stats = await orchestrator.run()
    t.equal(stats.successes, 1)
    t.equal(stats.errors.length, 0)
  })

  test('agentAddress and dnaAddress', async t => {
    t.plan(4)
    const C = testConfig()
    const orchestrator = await testOrchestrator()
    orchestrator.registerScenario('check addresses', async s => {
      const { alice } = await s.players({ alice: C.alice }, true)
      const agentAddress = await alice.call('app', 'main', 'whoami', {})
      t.equal(alice.info('app').agentAddress, agentAddress.Ok)
      t.equal(alice.info('app').dnaAddress.length, 46)
    })
    const stats = await orchestrator.run()
    t.equal(stats.successes, 1)
    t.equal(stats.errors.length, 0)
  })

}
