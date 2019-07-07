import {simpleExecutor} from '../src/executors'
import {OrchestratorClass} from '../src/orchestrator'
import * as test from 'tape'

import {genConfig, spawnConductor} from './common'

const http = require('http')

test('a', async t => {

  class TestConductor {
    initialize() {}
    kill() {}
    run (instanceConfigs, bridgeConfigs, fn) {
      t.deepEqual(instanceConfigs, [
        {
          id: 'alice',
          agent: {
            id: 'alice',
            name: 'alice'
          },
          dna: {
            path: 'path',
            id: 'name'
          }
        },
        {
          id: 'bob',
          agent: {
            id: 'bob',
            name: 'bob'
          },
          dna: {
            path: 'path',
            id: 'name'
          }
        }
      ])
      fn('not very good test')
    }
  }
  const Orchestrator = OrchestratorClass(TestConductor)

  const dna = Orchestrator.dna("path", "name")

  const orchestrator = new Orchestrator({
    conductors: {
      alice: {
        instances: {
          dpki: dna,
          holofuel: dna
        },
        bridges: [
          Orchestrator.bridge('bridge', 'holofuel', 'dpki')
        ],
      },

      bob: {
        instances: {
          dpki: dna,
          holofuel: dna
        },
        bridges: [
          Orchestrator.bridge('bridge', 'holofuel', 'dpki')
        ],
      },
    },
    debugLog: false,
    genConfig,
    spawnConductor,
  })

  t.equal(Object.keys(orchestrator.conductorConfigs).length, 2)
  t.equal(orchestrator.conductorConfigs.alice.instances.length, 2)
  t.equal(orchestrator.conductorConfigs.alice.bridges!.length, 1)
  t.equal(orchestrator.conductorConfigs.bob.instances.length, 2)
  t.equal(orchestrator.conductorConfigs.bob.bridges!.length, 1)

  orchestrator.registerScenario('test scenario 1', async (s, notInstances) => {
    t.ok(s.consistent)
    t.equal(notInstances, 'not very good test')
  })

  t.equal(orchestrator.scenarios.length, 1)

  console.warn("TODO: reinstate a test that actually runs the orchestrator")
  // await orchestrator.run()

  t.end()
})

test('callbacks', async t => {
  class TestConductor {
    initialize() {}
    kill() {}
    run (instanceConfigs, bridgeConfigs, fn) {
      fn('not very good test')
    }
  }
  const Orchestrator = OrchestratorClass(TestConductor)
  const dna = Orchestrator.dna("path", "name")
  const orchestrator = new Orchestrator({
    conductors: {
      alice: {
        instances: {
          dpki: dna,
          holofuel: dna
        },
        bridges: [
          Orchestrator.bridge('bridge', 'holofuel', 'dpki')
        ],
      },
    },
    debugLog: false,
    genConfig,
    spawnConductor,
  })

  console.warn("TODO: reinstate a test that actually runs the orchestrator")
  // http.get('http://0.0.0.0:4242/?name=alice&url=http://0.0.0.0:3000')
  // await orchestrator.run()

  t.end()
})
