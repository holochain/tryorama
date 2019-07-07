import {Orchestrator, simpleExecutor} from '../src'

import * as test from 'tape'
import * as T from '../src/types'

test("end to end, sort of", async t => {
  const orchestrator = new Orchestrator({
    conductors: {},
    executor: simpleExecutor,
    genConfig: (() => {}) as unknown as T.GenConfigFn,
    spawnConductor: (() => {}) as unknown as T.SpawnConductorFn,
  })
  orchestrator.runScenario = async scenario => scenario('s', 'ins')
  orchestrator.registerScenario('description', async (s, ins) => {
    t.equal(s, 's')
    t.equal(ins, 'ins')
    t.end()
  })
  orchestrator.scenarios[0][1]()
})
