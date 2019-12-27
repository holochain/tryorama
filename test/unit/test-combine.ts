const sinon = require('sinon')
const test = require('tape')
const TOML = require('@iarna/toml')
import * as _ from 'lodash'

import * as T from '../../src/types'
import Builder from '../../src/config/builder';
import * as Gen from '../../src/config/gen';
import { combineConfigs, mergeJsonConfigs, adjoin } from '../../src/config/combine';

const makeTestConfigs = async () => {
  const dna1a = Builder.dna('path/to/dna1.json', 'dna-1', { uuid: 'a' })
  const dna1b = Builder.dna('path/to/dna1.json', 'dna-1', { uuid: 'b' })
  const dna2 = Builder.dna('path/to/dna2.json', 'dna-2')
  const commonConfig = {logger: Builder.logger(false), network: Builder.network('n3h')}

  const mkInstance = (playerName, id, dna) => ({
    id: adjoin(playerName)(id),
    dna,
    agent: {
      name: adjoin(playerName)(`${playerName}::${id}::uuid`),
      id: adjoin(playerName)(id),
      keystore_file: '[UNUSED]',
      public_address: '[SHOULD BE REWRITTEN]',
      test_agent: true,
    }
  })
  const configs = {
    one: Builder.gen({
      alice: dna1a,
      bob: dna1b,
    }, {
      bridges: [Builder.bridge('b', 'alice', 'bob')],
      dpki: Builder.dpki('alice', { well: 'hello' }),
      ...commonConfig
    }),
    two: Builder.gen({
      xena: dna1a,
      yancy: dna1b,
      ziggy: dna2,
    }, {
      bridges: [
        Builder.bridge('x', 'xena', 'yancy'),
        Builder.bridge('y', 'yancy', 'ziggy'),
      ],
      dpki: Builder.dpki('xena', { well: 'hello' }),
      ...commonConfig
    }),
    three: Builder.gen({
      alice: dna2,
      bob: dna2,
    }, {
      bridges: [Builder.bridge('b', 'alice', 'bob')],
      dpki: Builder.dpki('bob', { well: 'hello' }),
      ...commonConfig
    }),
  }

  const expected = Builder.gen(
    [
      mkInstance('one', 'alice', dna1a),
      mkInstance('one', 'bob', dna1b),
      mkInstance('two', 'xena', dna1a),
      mkInstance('two', 'yancy', dna1b),
      mkInstance('two', 'ziggy', dna2),
      mkInstance('three', 'alice', dna2),
      mkInstance('three', 'bob', dna2),
    ],
    {
      bridges: [
        Builder.bridge('b', 'alice--one', 'bob--one'),
        Builder.bridge('x', 'xena--two', 'yancy--two'),
        Builder.bridge('y', 'yancy--two', 'ziggy--two'),
        Builder.bridge('b', 'alice--three', 'bob--three')
      ],
      dpki: Builder.dpki('alice', { well: 'hello' }),
      ...commonConfig
    }
  )

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

const expandConfig = async (config, playerName): Promise<T.RawConductorConfig> => {
  return config({
    configDir: 'dir',
    adminPort: 1111,
    zomePort: 2222,
    uuid: 'uuid',
    playerName
  })
}

test('test configs are valid', async t => {
  const stubGetDnaHash = sinon.stub(Gen, 'getDnaHash').resolves('fakehash')
  const { configs, expected } = await makeTestConfigs()
  stubGetDnaHash.restore()

  t.doesNotThrow(() => Gen.assertUniqueTestAgentNames(Object.values(configs)))
  t.doesNotThrow(() => Gen.assertUniqueTestAgentNames([expected]))
  t.end()
})

// TODO: this broke when setting default storage config to lmdb
test('can combine configs', async t => {
  const stubGetDnaHash = sinon.stub(Gen, 'getDnaHash').resolves('fakehash')
  const { configs, expected } = await makeTestConfigs()


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
