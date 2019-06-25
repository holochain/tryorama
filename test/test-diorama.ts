import {simpleExecutor} from '../src/executors'
import {DioramaClass} from '../src/diorama'
import * as test from 'tape'

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
  const Diorama = DioramaClass(TestConductor)

  const dna = Diorama.dna("path", "name")

  const diorama = new Diorama({
    conductors: {
      alice: {
        instances: {
          dpki: dna,
          holofuel: dna
        },
        bridges: [
          Diorama.bridge('bridge', 'holofuel', 'dpki')
        ],
      },

      bob: {
        instances: {
          dpki: dna,
          holofuel: dna
        },
        bridges: [
          Diorama.bridge('bridge', 'holofuel', 'dpki')
        ],
      },
    },

    debugLog: false,
  })

  t.equal(Object.keys(diorama.conductorConfigs).length, 2)
  t.equal(diorama.conductorConfigs.alice.instances.length, 2)
  t.equal(diorama.conductorConfigs.alice.bridges.length, 1)
  t.equal(diorama.conductorConfigs.bob.instances.length, 2)
  t.equal(diorama.conductorConfigs.bob.bridges.length, 1)

  diorama.registerScenario('test scenario 1', async (s, notInstances) => {
    t.ok(s.consistent)
    t.equal(notInstances, 'not very good test')
  })

  t.equal(diorama.scenarios.length, 1)

  await diorama.run()

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
  const Diorama = DioramaClass(TestConductor)
  const dna = Diorama.dna("path", "name")
  const diorama = new Diorama({
    conductors: {
      alice: {
        instances: {
          dpki: dna,
          holofuel: dna
        },
        bridges: [
          Diorama.bridge('bridge', 'holofuel', 'dpki')
        ],
      },
    },
    debugLog: false,
    callbacksPort: 4242
  })

  http.get('http://0.0.0.0:4242/?name=alice&url=http://0.0.0.0:3000')

  await diorama.run()

  t.end()
})
