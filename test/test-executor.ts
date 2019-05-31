import {Playbook, simpleExecutor} from '../src'

import * as test from 'tape'

test("end to end, sort of", async t => {
  const playbook = new Playbook({
    executor: simpleExecutor
  })
  playbook.runScenario = async scenario => scenario('s', 'ins')
  playbook.registerScenario('description', async (s, ins) => {
    t.equal(s, 's')
    t.equal(ins, 'ins')
    t.end()
  })
  playbook.scenarios[0][1]()
})
