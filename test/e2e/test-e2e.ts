const test = require('tape')

import { Orchestrator, Config } from '../../src'
import { delay } from '../../src/util';


const testConfig = () => {

  const dna = Config.dna(
    'https://github.com/holochain/holochain-basic-chat/releases/download/0.0.15/holochain-basic-chat.dna.json'
  )

  return {
    alice: Config.genConfig({
      instances: {
        chat: dna
      },
    }),
    bob: Config.genConfig({
      instances: {
        chat: dna
      }
    })
  }
}

test('test with error', async t => {
  const C = testConfig()
  const orchestrator = new Orchestrator()
  orchestrator.registerScenario('invalid instance', async s => {
    const { alice } = await s.conductors({ alice: C.alice })
    await alice.spawn()
    await alice.call('blah', 'blah', 'blah', 'blah')
    alice.kill()
  })
  const stats = await orchestrator.run()
  t.equal(stats.successes, 0)
  t.equal(stats.errors.length, 1)
  t.equal(stats.errors[0].error.message, 'instance identifier invalid')
  t.end()
})

test('test with simple zome call', async t => {
  const C = testConfig()
  const orchestrator = new Orchestrator({ reporter: true })
  orchestrator.registerScenario('proper zome call', async s => {
    const players = await s.conductors({ alice: C.alice })
    const { alice } = players
    await alice.spawn()
    const agentAddress = await alice.call('chat', 'chat', 'register', {
      name: 'alice',
      avatar_url: 'https://tinyurl.com/yxcwavlr',
    })
    t.equal(agentAddress.Ok.length, 63)
  })
  const stats = await orchestrator.run()
  t.equal(stats.successes, 1)
  t.equal(stats.errors.length, 0)
  t.end()
})

///////////////////////////////////////////////////////////////////


test.skip('test with successful zome call', async t => {
  const C = testConfig()
  const orchestrator = new Orchestrator()
  orchestrator.registerScenario('proper zome call', async s => {
    const { alice } = await s.conductors({ alice: C.alice })
    await alice.spawn()
    const agentAddress = await alice.call('chat', 'chat', 'register', {
      name: 'alice',
      avatar_url: 'https://tinyurl.com/yxcwavlr',
    })
    // TODO: decide on this syntax and hook it up
    t.equal(alice.var('app', 'agentAddress'), agentAddress)
  })
  const stats = await orchestrator.run()
  t.equal(stats.successes, 1)
  t.equal(stats.errors.length, 0)
  t.end()
})

test.skip('test with kill and respawn', async t => {
  const C = testConfig()
  const orchestrator = new Orchestrator()
  orchestrator.registerScenario('proper zome call', async s => {
    const { alice } = await s.conductors({ alice: C.alice })
    await alice.spawn()
    console.log('delaying...')
    await delay(15000)
    await alice.kill()

    t.throws(() => alice.call('chat', 'x', 'x', 'x'))

    await alice.spawn()
    const agentAddress = await alice.call('chat', 'chat', 'register', {
      name: 'alice',
      avatar_url: 'https://tinyurl.com/yxcwavlr',
    })
    t.equal(agentAddress.length, 46)
  })
  const stats = await orchestrator.run()
  t.equal(stats.successes, 1)
  t.equal(stats.errors.length, 0)
  t.end()
})