// See README.md for prerequisites for this to run

import { Orchestrator, Config, InstallAgentsHapps } from "../src"
import { ScenarioApi } from "../src/api"
import path from 'path'

const orchestrator = new Orchestrator()

const conductorConfig = Config.gen()

const conductorHapps: InstallAgentsHapps = [
  // agent 0 ... 
  [
    // happ 0
    [
      // dna 0
      path.join(__dirname, 'test.dna.gz')
    ]
  ],
]

orchestrator.registerScenario('basic test', async (s: ScenarioApi, t) => {
  // a player is very close to being the same as a single conductor
  const [player0] = await s.players([conductorConfig])

  // a single player can have installed:
  // many agents,
  // many apps (collection of cells for an agent),
  // and many cells (DNA + AGENT)

  // pop off (destructure) the first agent, and the first happ within that
  // of the resulting array of arrays
  const [[agent0happ0]] = await player0.installAgentsHapps(conductorHapps)
  const [agent0happ0cell0] = agent0happ0.cells
  const ZOME_NAME = 'foo'
  const FN_NAME = 'foo'
  const PAYLOAD = null
  const res = await agent0happ0cell0.call(ZOME_NAME, FN_NAME, PAYLOAD)
  // or 
  // const res = await agent0happ0.cells[0].call(ZOME_NAME, FN_NAME, PAYLOAD)
  t.equal(res, 'foo')
})

orchestrator.run()

