const sinon = require('sinon')
const test = require('tape')

import { Orchestrator } from '../src/orchestrator'
import * as T from '../src/types'
import * as C from '../src/config';


test('Sugared config', async t => {
  const dna = C.dna('path/to/dna.json', 'dna-id', { uuid: 'uuid' })
  const common = {
    name: 'conducty mcconductorface',
    bridge: C.bridge('b', 'alice', 'bob'),
    dpki: C.dpki('alice'),
  }
  const instancesSugared = {
    alice: dna,
    bob: dna,
  }
  const instancesDesugared: Array<T.InstanceConfig> = [
    {
      id: 'alice',
      agent: {
        id: 'alice',
        name: 'alice',
      },
      dna: {
        id: 'dna-id',
        path: 'path/to/dna.json',
        uuid: 'uuid'
      }
    },
    {
      id: 'bob',
      agent: {
        id: 'bob',
        name: 'bob',
      },
      dna: {
        id: 'dna-id',
        path: 'path/to/dna.json',
        uuid: 'uuid'
      }
    }
  ]
  const sugared = Object.assign({}, common, { instances: instancesSugared })
  const expected = Object.assign({}, common, { instances: instancesDesugared })
  t.deepEqual(C.desugarConfig(sugared), expected)
  t.end()
})
