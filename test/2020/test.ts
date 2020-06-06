// Works with:
// - holochain-2020 branch='legacy-tryorama-config' commit='e502e309dfd3e27bab0a2578833deeaa13dca7b3'
// - tryorama-2020 branch='bolt-on' commit='338548c174e06adb60445e541c36d1e3d0a1de04'
// - must have a valid test.dna.gz present in this directory

// Just do `npm test` in this directory to run

const { Orchestrator, Config } = require('../../src')

const testDna = Config.dna("test.dna.gz")

const config = Config.gen({
  tester: testDna,
})

const orchestrator = new Orchestrator()

orchestrator.registerScenario('list dnas', async (s, t) => {
  const { antony } = await s.players({ antony: config })
  await antony.spawn()

  const dnas = await antony.admin().listDnas()
  console.log('dnas', dnas)

  t.equal(dnas.length, 1)
})

orchestrator.registerScenario('call zome', async (s, t) => {
  const { antony } = await s.players({ antony: config })
  await antony.spawn()

  const result = await antony.call('tester', 'foo', 'foo', { anything: 'goes' })
  console.log('result', result)

  t.equal(result, 'foo')
})

orchestrator.run()

