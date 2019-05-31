import {simpleExecutor} from '../src/executors'
import {PlaybookClass} from '../src/playbook'

import * as test from 'tape'


test('a', async t => {

  class TestConductor {
    initialize() {}
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
  const Playbook = PlaybookClass(TestConductor)

  const dna = Playbook.dna("path", "name")
  const playbook = new Playbook({
    instances: {
      alice: dna,
      bob: dna
    },
    bridges: [
      Playbook.bridge('bridge', 'alice', 'bob')
    ],
    debugLog: false,
  })

  t.equal(playbook.instanceConfigs.length, 2)
  t.equal(playbook.bridgeConfigs.length, 1)

  playbook.registerScenario('test scenario 1', async (s, notInstances) => {
    t.ok(s.consistent)
    t.equal(notInstances, 'not very good test')
  })

  t.equal(playbook.scenarios.length, 1)

  await playbook.run()

  t.end()
})