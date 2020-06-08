// See README.md for prerequisites for this to run

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

orchestrator.registerScenario('state dump', async (s, t) => {
  const { antony } = await s.players({ antony: config })
  await antony.spawn()

  const dump = await antony.stateDump('tester')
  t.equal(dump.length, 3)
  t.ok(typeof dump[0].element === 'object')
  t.ok(typeof dump[1].element === 'object')
  t.ok(typeof dump[2].element === 'object')
})

orchestrator.run()

