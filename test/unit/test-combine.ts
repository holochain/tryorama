const _ = require('lodash')
const sinon = require('sinon')
const test = require('tape')
const TOML = require('@iarna/toml')

import * as T from '../../src/types'
import * as C from '../../src/config';
import * as Gen from '../../src/config/gen';
import { combineConfigs, mergeJsonConfigs, adjoin } from '../../src/config/combine';
import { genConfigArgs } from '../common';
import { promiseSerialObject, trace } from '../../src/util';

const makeTestConfigs = async () => {
  const dna1a = C.dna('path/to/dna1.json', 'dna-1', { uuid: 'a' })
  const dna1b = C.dna('path/to/dna1.json', 'dna-1', { uuid: 'b' })
  const dna2 = C.dna('path/to/dna2.json', 'dna-2')

  const mkInstance = (conductorName, id, dna) => ({
    id: adjoin(conductorName)(id),
    dna,
    agent: {
      name: adjoin(conductorName)(`${conductorName}::${id}::uuid`),
      id: adjoin(conductorName)(id),
      keystore_file: '[UNUSED]',
      public_address: '[SHOULD BE REWRITTEN]',
      test_agent: true,
    }
  })

  const configs = {
    one: {
      instances: {
        alice: dna1a,
        bob: dna1b,
      },
      bridges: [C.bridge('b', 'alice', 'bob')],
      dpki: C.dpki('alice', { well: 'hello' }),
    },
    two: {
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
    three: {
      instances: {
        alice: dna2,
        bob: dna2,
      },
      bridges: [C.bridge('b', 'alice', 'bob')],
      dpki: C.dpki('bob', { well: 'hello' }),
    },
  }

  const expected = {
    instances: [
      mkInstance('one', 'alice', dna1a),
      mkInstance('one', 'bob', dna1b),
      mkInstance('two', 'xena', dna1a),
      mkInstance('two', 'yancy', dna1b),
      mkInstance('two', 'ziggy', dna2),
      mkInstance('three', 'alice', dna2),
      mkInstance('three', 'bob', dna2),
    ],
    bridges: [
      C.bridge('b', 'alice--one', 'bob--one'),
      C.bridge('x', 'xena--two', 'yancy--two'),
      C.bridge('y', 'yancy--two', 'ziggy--two'),
      C.bridge('b', 'alice--three', 'bob--three')
    ],
    dpki: C.dpki('alice', { well: 'hello' })
  }

  return {
    configs: await (
      _.chain(configs)
      .toPairs()
      .map(async ([name, c]) => [name, await expandConfig(c, name)])
      .thru(x => Promise.all(x))
      .value()
      .then(_.fromPairs)
    ),
    expected: await expandConfig(expected, 'expected')
  }
}

const expandConfig = async (config, conductorName): Promise<any> => {
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

  t.doesNotThrow(() => Gen.assertUniqueTestAgentNames(Object.values(configs)))
  t.doesNotThrow(() => Gen.assertUniqueTestAgentNames([expected]))
  t.end()
})

test('can combine configs', async t => {
  const stubGetDnaHash = sinon.stub(Gen, 'getDnaHash').resolves('fakehash')
  const {configs, expected} = await makeTestConfigs()

  const combined = mergeJsonConfigs(configs)
  t.deepEqual(combined.agents, expected.agents)
  t.deepEqual(combined.dnas, expected.dnas)
  t.deepEqual(combined.bridges, expected.bridges)
  t.deepEqual(combined.instances, expected.instances)
  t.deepEqual(combined.interfaces, expected.interfaces)
  
  t.deepEqual(combined, expected)
  t.end()
  stubGetDnaHash.restore()
})