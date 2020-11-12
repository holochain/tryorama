// See README.md for prerequisites for this to run

import { Orchestrator, Config, InstallHapps } from "../../src"
import { ScenarioApi } from "../../src/api"
import path from 'path'

const orchestrator = new Orchestrator()

const conductor1Config = Config.gen()
const conductor2Config = Config.gen()

const conductor2Apps: InstallHapps = [
  // agent 1
  [
    // dna 1
    path.join(__dirname, 'test.dna.gz')//,
    // dna 2...
  ],
  // agent 2
  [
    // dna 1
    path.join(__dirname, 'test.dna.gz')//,
    // dna 2...
  ]
]

orchestrator.registerScenario('list dnas', async (s: ScenarioApi, t) => {
  const [[antonyConductor, [[antony1TestCell], [antony2TestCell]]]] = await s.players(
    [[conductor2Config, conductor2Apps]]
  )
  const res = await antony1TestCell.call('foo', 'foo', null)
  // console.log('result!', res)
  t.equal(res, 'foo')
})

orchestrator.run()

