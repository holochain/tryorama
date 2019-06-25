import {Diorama, simpleExecutor} from '../src'

import * as test from 'tape'

test("end to end, sort of", async t => {
  const diorama = new Diorama({
    conductors: {},
    executor: simpleExecutor
  })
  diorama.runScenario = async scenario => scenario('s', 'ins')
  diorama.registerScenario('description', async (s, ins) => {
    t.equal(s, 's')
    t.equal(ins, 'ins')
    t.end()
  })
  diorama.scenarios[0][1]()
})
