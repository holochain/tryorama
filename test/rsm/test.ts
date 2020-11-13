// See README.md for prerequisites for this to run

import { Orchestrator, Config, InstallHapps } from "../../src"
import { ScenarioApi } from "../../src/api"
import path from 'path'

const orchestrator = new Orchestrator()

const conductor1Config = Config.gen()
const conductor2Config = Config.gen()

const conductor2Happs: InstallHapps = [
  // agent 0 ... allow for length 1 lists, without brackets, to make it cleaner
  path.join(__dirname, 'test.dna.gz'),
  // agent 1
  [path.join(__dirname, 'test.dna.gz')],
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
  const [player2happ1, player2happ2] = await player2.installHapps(conductor2Happs)
  const [player2happ2cell1] = player2happ2.cells
  const res = await player2happ2cell1.call('foo', 'foo', null)
  // or 
  // const res = await player2happ2.cells[0].call('foo', 'foo', null)

  // console.log('result!', res)
  t.equal(res, 'foo')
})

orchestrator.run()

