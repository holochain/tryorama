const test = require('tape')

import { Orchestrator, Config } from '../../src'


const testConfig = () => {

  const dna = Config.dna(
    'https://github.com/holochain/holochain-basic-chat/releases/download/0.0.15/holochain-basic-chat.dna.json'
  )

  return {
    alice: Config.genConfig({
      name: 'alice',
      instances: {
        chat: dna
      },
    }),
    bob: Config.genConfig({
      name: 'bob',
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
    const [alice] = await s.conductors([C.alice])
    await alice.spawn()
    await alice.call('blah', 'blah', 'blah', 'blah')
    alice.kill()
  })
  const stats = await orchestrator.run()
  t.equal(stats.successes, 0)
  t.equal(stats.errors.length, 1)
  t.deepEqual(stats.errors[0].message.message, 'instance identifier invalid')
  t.end()
})

test('test with successful zome call', async t => {
  const C = testConfig()
  const orchestrator = new Orchestrator()
  orchestrator.registerScenario('proper zome call', async s => {
    const [alice] = await s.conductors([C.alice])
    await alice.spawn()
    const agentAddress = await alice.call('chat', 'chat', 'handle_register', {
      name: 'alice',
      avatar_url: 'https://tinyurl.com/yxcwavlr',
    })
    t.equal(alice.agentAddress, agentAddress)
  })
  const stats = await orchestrator.run()
  t.equal(stats.successes, 1)
  t.equal(stats.errors.length, 0)
  t.end()
})