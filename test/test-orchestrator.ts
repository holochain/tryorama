import {simpleExecutor} from '../src/executors'
import {OrchestratorClass} from '../src/orchestrator'

import {test, genConfig, spawnConductor} from './common'

class TestConductor {
  initialize() {}
  kill() {}
  run (instanceConfigs, bridgeConfigs, fn) {
    fn('not very good test')
  }
}
const Orchestrator = OrchestratorClass(TestConductor)
const dna = Orchestrator.dna("path", "name")
const C = {
  alice: {
    instances: {
      app: dna
    }
  }
}

test('Scenario API constructed properly', async t => {
  const orchestrator = new Orchestrator({spawnConductor})
  orchestrator.registerScenario('test scenario 1', async s => {
    t.deepEqual(
      Object.keys(s),
      ['consistent']
    )
  })
  t.end()
})

test('registerScenario', async t => {
  const orchestrator = new Orchestrator({spawnConductor})
  orchestrator.registerScenario('test scenario 1', async s => {
    const alice = await s.conductors(C.alice)
    await alice.call('zome', 'func', {args: 1})
  })
  t.end()
})
