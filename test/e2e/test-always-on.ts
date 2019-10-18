import * as tape from 'tape'
import tapeP from 'tape-promise'

const test = tapeP(tape)

import { Orchestrator, Config } from '../../src'
import { runSeries } from '../../src/middleware'
import { delay } from '../../src/util';
import { GlobalConfig } from '../../src/types';
import { testConfig } from '../common';

module.exports = (testOrchestrator) => {

  test('test with error', async t => {
    const C = testConfig()
    const orchestrator = testOrchestrator()
    orchestrator.registerScenario('invalid instance', async s => {
      const { alice } = await s.players({ alice: C.alice }, true)
      await alice.call('blah', 'blah', 'blah', 'blah')
    })
    const stats = await orchestrator.run()
    t.equal(stats.successes, 0)
    t.equal(stats.errors.length, 1)
    t.ok(stats.errors[0].error.message.match(/instance identifier invalid.*/))
    t.end()
  })

  test('test with simple zome call', async t => {
    t.plan(3)
    const C = testConfig()
    const orchestrator = testOrchestrator()
    orchestrator.registerScenario('simple zome call', async s => {
      const players = await s.players({ alice: C.alice }, true)
      const { alice } = players
      const agentAddress = await alice.call('chat', 'chat', 'register', {
        name: 'alice',
        avatar_url: 'https://tinyurl.com/yxcwavlr',
      })
      t.equal(agentAddress.Ok.length, 63, 'zome call succeeded')
    })
    const stats = await orchestrator.run()
    t.equal(stats.successes, 1, 'only success')
    t.equal(stats.errors.length, 0, 'no errors')
    console.log(stats)
  })

  test('test with simple zome call via instance', async t => {
    t.plan(3)
    const C = testConfig()
    const orchestrator = testOrchestrator()
    orchestrator.registerScenario('simple zome call', async s => {
      const players = await s.players({ alice: C.alice }, true)
      const { alice } = players
      const instance = alice.instance('chat')
      const agentAddress = await instance.call('chat', 'register', {
        name: 'alice',
        avatar_url: 'https://tinyurl.com/yxcwavlr',
      })
      t.equal(agentAddress.Ok.length, 63, 'zome call succeeded')
    })
    const stats = await orchestrator.run()
    t.equal(stats.successes, 1, 'only success')
    t.equal(stats.errors.length, 0, 'no errors')
    console.log(stats)
  })

  test('test with consistency awaiting', async t => {
    t.plan(4)
    const C = testConfig()
    const orchestrator = testOrchestrator()
    orchestrator.registerScenario('zome call with consistency', async s => {
      const { alice, bob } = await s.players({ alice: C.alice, bob: C.bob }, true)

      // TODO: this sometimes does not properly await...
      await s.consistency()

      // ... i.e., sometimes this fails with "base for link not found"
      const streamAddress = await alice.call('chat', 'chat', 'create_stream', {
        name: 'stream',
        description: 'whatever',
        initial_members: [
          bob.info('chat').agentAddress
        ],
      })
      t.ok(streamAddress.Ok, 'alice create stream')
      await s.consistency()

      const messageResult = await alice.call('chat', 'chat', 'post_message', {
        stream_address: streamAddress.Ok,
        message: {
          message_type: 'type',
          timestamp: 0,
          payload: 'hello',
          meta: '',
        }
      })
      await s.consistency()

      const streams = await bob.call('chat', 'chat', 'get_all_public_streams', {})
      t.ok(streams.Ok, 'bob gets streams')
      // TODO: have bob check that he can see alice's stream
    })
    const stats = await orchestrator.run()
    t.equal(stats.successes, 1)
    t.equal(stats.errors.length, 0)
  })

  test('agentAddress and dnaAddress', async t => {
    t.plan(4)
    const C = testConfig()
    const orchestrator = testOrchestrator()
    orchestrator.registerScenario('check addresses', async s => {
      const { alice } = await s.players({ alice: C.alice }, true)
      const agentAddress = await alice.call('chat', 'chat', 'register', {
        name: 'alice',
        avatar_url: 'https://tinyurl.com/yxcwavlr',
      })
      t.equal(alice.info('chat').agentAddress, agentAddress.Ok)
      t.equal(alice.info('chat').dnaAddress.length, 46)
    })
    const stats = await orchestrator.run()
    t.equal(stats.successes, 1)
    t.equal(stats.errors.length, 0)
  })

}