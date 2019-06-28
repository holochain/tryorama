import {Orchestrator, simpleExecutor} from '../src'

import * as test from 'tape'

test("end to end, sort of", async t => {
  const orchestrator = new Orchestrator({
    conductors: {},
    executor: simpleExecutor
  })
  orchestrator.runScenario = async scenario => scenario('s', 'ins')
  orchestrator.registerScenario('description', async (s, ins) => {
    t.equal(s, 's')
    t.equal(ins, 'ins')
    t.end()
  })
  orchestrator.scenarios[0][1]()
})
