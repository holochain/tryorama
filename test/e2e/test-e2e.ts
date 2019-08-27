const test = require('tape')

import { Orchestrator, Config } from '../../src'

const orchestrator = new Orchestrator()

test('e2e 1', async t => {
  const dna = Config.dna(
    'https://github.com/holochain/holochain-basic-chat/releases/download/0.0.15/holochain-basic-chat.dna.json'
  )
  const C = {
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
  orchestrator.registerScenario('e2e 1', async s => {
    const [alice, bob] = await s.conductors([C.alice, C.bob])
    await alice.spawn()
    await bob.spawn()

    alice.kill()
    bob.kill()
  })
  await orchestrator.run()
  t.end()
})