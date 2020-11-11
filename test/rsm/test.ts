// See README.md for prerequisites for this to run

const { Orchestrator, Config } = require('../../src')

const orchestrator = new Orchestrator()

const conductor1 = Config.gen()

orchestrator.registerScenario('list dnas', async (s, t) => {
  const { antony } = await s.players({ conductor1 })
  await antony.spawn()

  const dnas = await antony.admin().listDnas()
  console.log('dnas', dnas)

  t.equal(dnas.length, 1)
})

orchestrator.run()

