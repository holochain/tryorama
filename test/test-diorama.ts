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
    instances: {
      alice: dna,
      bob: dna
    },
    bridges: [
      Diorama.bridge('bridge', 'alice', 'bob')
    ],
    debugLog: false,
  })

  t.equal(diorama.instanceConfigs.length, 2)
  t.equal(diorama.bridgeConfigs.length, 1)

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
    instances: {
      alice: dna,
      bob: dna
    },
    bridges: [
      Diorama.bridge('bridge', 'alice', 'bob')
    ],
    debugLog: false,
    externalConductors: true,
    callbacksPort: 4242
  })

  http.get('http://0.0.0.0:4242/?name=alice&url=http://0.0.0.0:3000')

  await diorama.run()

  t.end()
})
