const sinon = require('sinon')
const test = require('tape')
const TOML = require('@iarna/toml')

import * as T from '../../src/types'
import * as C from '../../src/config';
import * as Gen from '../../src/config/gen';
import { combineConfigs, mergeJsonConfigs, incBy } from '../../src/config/combine';
import { genConfigArgs } from '../common';

const makeTestConfigs = async () => {
  const dna1a = C.dna('path/to/dna1.json', 'dna-1', { uuid: 'a' })
  const dna1b = C.dna('path/to/dna1.json', 'dna-1', { uuid: 'b' })
  const dna2 = C.dna('path/to/dna2.json', 'dna-2')

  const mkInstance = (n, id, dna) => ({
    id: incBy(n)(id),
    dna,
    agent: Gen.makeTestAgent(id, {
      conductorName: `conductor-${n}`,
      uuid: 'uuid',
    } as T.GenConfigArgs)
  })

  const configs = [
    {
      instances: {
        alice: dna1a,
        bob: dna1b,
      },
      bridges: [C.bridge('b', 'alice', 'bob')],
      dpki: C.dpki('alice', { well: 'hello' }),
    },
    {
      instances: {
        xena: dna1a,
        yancy: dna1b,
        ziggy: dna2,
      },
      bridges: [
        C.bridge('x', 'xena', 'yancy'),
        C.bridge('y', 'yancy', 'ziggy'),
      ],
      dpki: C.dpki('xena', { well: 'hello' }),
    },
    {
      // create these instances more methodically.
      // we want the instance IDs to be the same as an earlier
      // conductor, but the agent IDs must be unique
      // instances: [
      //   {
      //     id: 'alice',
      //     dna: dna2,
      //     agent: Gen.makeTestAgent('alice-clone', {
      //       conductorName: 'conductorName',
      //       uuid: 'uuid',
      //     } as T.GenConfigArgs)
      //   },
      //   {
      //     id: 'bob',
      //     dna: dna2,
      //     agent: Gen.makeTestAgent('bob-clone', {
      //       conductorName: 'conductorName',
      //       uuid: 'uuid',
      //     } as T.GenConfigArgs)
      //   }
      // ],
      instances: {
        alice: dna2,
        bob: dna2,
      },
      bridges: [C.bridge('b', 'alice-clone', 'bob-clone')],
      dpki: C.dpki('bob', { well: 'hello' }),
    },
  ]

  const expected = {
    instances: [
      mkInstance(0, 'alice', dna1a),
      mkInstance(0, 'bob', dna1b),
      mkInstance(1, 'xena', dna1a),
      mkInstance(1, 'yancy', dna1b),
      mkInstance(1, 'ziggy', dna2),
      mkInstance(2, 'alice', dna2),
      mkInstance(2, 'bob', dna2),
    ],
    bridges: [
      C.bridge('b', 'alice0', 'bob0'),
      C.bridge('x', 'xena1', 'yancy1'),
      C.bridge('y', 'yancy1', 'ziggy1'),
      C.bridge('b', 'alice2', 'bob2')
    ],
    dpki: C.dpki('alice', { well: 'hello' })
  }

  return { 
    configs: await Promise.all(configs.map(async (c, i) => await expandConfig(c, `conductor-${i}`))), 
    expected: await expandConfig(expected, 'expected')
  }
}

const expandConfig = async (config, conductorName) => {
  const builder = C.genConfig(config, false)
  const toml = await builder({ 
    configDir: 'dir', 
    adminPort: 1111, 
    zomePort: 2222, 
    uuid: 'uuid', 
    conductorName
  })
  return TOML.parse(toml)
}

test('test configs are valid', async t => {
  const stubGetDnaHash = sinon.stub(Gen, 'getDnaHash').resolves('fakehash')
  const {configs, expected} = await makeTestConfigs()
  stubGetDnaHash.restore()

  t.doesNotThrow(() => Gen.assertUniqueTestAgentNames(configs))
  t.doesNotThrow(() => Gen.assertUniqueTestAgentNames([expected]))
  t.end()
})

test.only('can combine configs', async t => {
  const stubGetDnaHash = sinon.stub(Gen, 'getDnaHash').resolves('fakehash')
  const {configs, expected} = await makeTestConfigs()

  console.log("CONFIGS:\n", JSON.stringify(configs, null, 2))
  console.log("EXPECTED:\n", JSON.stringify(expected, null, 2))

  t.deepEqual(mergeJsonConfigs(configs), expected)
  t.end()
  stubGetDnaHash.restore()
})