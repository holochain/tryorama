// See README.md for prerequisites for this to run

import { Orchestrator, Config, InstallAgentsHapps } from "../../src"
import { ScenarioApi } from "../../src/api"
import path from 'path'

const orchestrator = new Orchestrator()

const conductor1Config = Config.gen()
const conductor2Config = Config.gen()

const conductor2Happs: InstallAgentsHapps = [
  // agent 0 ... 
  [
    // happ 1
    [
      // dna 1
      path.join(__dirname, 'test.dna.gz')
    ]
  ],

  // agent 0
  // two happs, three different dnas, same agent
  // [['holofuel.dna.gz'], ['elemental-chat.dna.gz']],
  // agent 1
  // [['elemental-chat.dna.gz']]

  // agent 2
  // [path.join(__dirname, 'test2.dna.gz')]
]

// orchestrator.registerScenario('list dnas', async (s: ScenarioApi, t) => {
//   const [[antonyConductor, [[antony1TestCell], [antony2TestCell]]]] = await s.players(
//     [[conductor2Config, conductor2Apps]]
//   )
//   const res = await antony1TestCell.call('foo', 'foo', null)
//   // console.log('result!', res)
//   t.equal(res, 'foo')
// })
orchestrator.registerScenario('list dnas', async (s: ScenarioApi, t) => {
  const [player2] = await s.players([conductor2Config])
  // const [[agent1happ1, agent1happ2], [agent2happ1]] = await player2.installAgentsHapps(conductor2Happs)
  const [[agent2happ1]] = await player2.installAgentsHapps(conductor2Happs)
  const [player2happ1cell1] = agent2happ1.cells
  const res = await player2happ1cell1.call('foo', 'foo', null)
  // or 
  // const res = await player2happ2.cells[0].call('foo', 'foo', null)

  // console.log('result!', res)
  t.equal(res, 'foo')
})

orchestrator.run()

