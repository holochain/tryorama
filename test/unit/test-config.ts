const sinon = require('sinon')
const test = require('tape')
const TOML = require('@iarna/toml')

import * as T from '../../src/types'
import * as util from '../../src/util'
import * as C from '../../src/config';
import Builder from '../../src/config/builder';
import * as Gen from '../../src/config/gen';
import { genConfigArgs } from '../common';
import { Orchestrator } from '../../src/orchestrator'

const blah = {} as any

// type CC = T.ConductorConfig

export const { instancesDry, instancesSugared } = (() => {
  const dna = Builder.dna('path/to/dna.json', 'dna-id', { uuid: 'uuid' })

  const instancesSugared: T.SugaredInstancesConfig = {
    alice: dna,
    bob: dna,
  }
  const instancesDry: T.DryInstancesConfig = [
    {
      id: 'alice',
      agent: {
        id: 'alice',
        name: 'name::alice::uuid',
        keystore_file: '[UNUSED]',
        public_address: '[SHOULD BE REWRITTEN]',
        test_agent: true,
      },
      dna: {
        id: 'dna-id',
        file: 'path/to/dna.json',
        uuid: 'uuid'
      }
    },
    {
      id: 'bob',
      agent: {
        id: 'bob',
        name: 'name::bob::uuid',
        keystore_file: '[UNUSED]',
        public_address: '[SHOULD BE REWRITTEN]',
        test_agent: true,
      },
      dna: {
        id: 'dna-id',
        file: 'path/to/dna.json',
        uuid: 'uuid'
      }
    }
  ]
  return { instancesDry, instancesSugared }
})()

const commonConfig = { logger: Builder.logger(false), network: Builder.network('n3h') }

test('DNA id generation', t => {
  t.equal(C.dnaPathToId('path/to/file'), 'file')
  t.equal(C.dnaPathToId('path/to/file.dna'), 'file.dna')
  t.equal(C.dnaPathToId('path/to/file.json'), 'file.json')
  t.equal(C.dnaPathToId('path/to/file.dna.json'), 'file')

  t.equal(C.dnaPathToId('file'), 'file')
  t.equal(C.dnaPathToId('file.json'), 'file.json')
  t.equal(C.dnaPathToId('file.dna.json'), 'file')
  t.end()
})

test('Sugared config', async t => {
  const args = { playerName: 'name', uuid: 'uuid' } as T.ConfigSeedArgs
  t.deepEqual(
    C.desugarInstances(instancesSugared, args), 
    instancesDry
  )
  t.end()
})

test('resolveDna ids and uuids', async t => {
  const stubDownloadFile = sinon.stub(util, 'downloadFile').resolves()
  const stubGetDnaHash = sinon.stub(Gen, 'getDnaHash').resolves('fakehash')
  const dna1 = await Gen.resolveDna({
    id: 'x',
    file: ' ',
  }, 'A')
  const dna2 = await Gen.resolveDna({
    id: 'x',
    file: ' ',
  }, 'B')
  const dna3 = await Gen.resolveDna({
    id: 'y',
    file: ' ',
  }, 'C')
  const dna4 = await Gen.resolveDna({
    id: 'x',
    uuid: 'a',
    file: ' ',
  }, 'D')
  const dna5 = await Gen.resolveDna({
    id: 'y',
    uuid: 'b',
    file: ' ',
  }, 'E')

  t.equal(dna1.id, 'x')
  t.equal(dna1.uuid, 'A')

  t.equal(dna2.id, 'x')
  t.equal(dna2.uuid, 'B')

  t.equal(dna3.id, 'y')
  t.equal(dna3.uuid, 'C')

  t.equal(dna4.id, 'x::a')
  t.equal(dna4.uuid, 'a::D')

  t.equal(dna5.id, 'y::b')
  t.equal(dna5.uuid, 'b::E')

  t.end()
  stubDownloadFile.restore()
  stubGetDnaHash.restore()
})

test('genPartialConfigFromDryInstances', async t => {
  const stubGetDnaHash = sinon.stub(Gen, 'getDnaHash').resolves('fakehash')
  const { agents, dnas, instances, interfaces } = await C.genPartialConfigFromDryInstances(instancesDry, await genConfigArgs())
  t.equal(agents.length, 2)
  t.equal(dnas.length, 1)
  t.equal(instances.length, 2)
  t.equal(interfaces.length, 2)
  t.ok(interfaces[0].admin, true)
  t.equal(interfaces[0].instances.length, 0)
  t.notOk(interfaces[1].admin)
  t.equal(interfaces[1].instances.length, 2)
  t.end()
  stubGetDnaHash.restore()
})

test('genBridgeConfig', async t => {
  const bridge = await Builder.bridge('b', 'alice', 'bob')
  t.deepEqual(bridge, { handle: 'b', caller_id: 'alice', callee_id: 'bob' })
  t.end()
})

test('genSignalConfig', async t => {
  const signals = await Builder.signals({})
  t.ok('trace' in signals)
  t.ok('consistency' in signals)
  t.equal(signals.consistency, true)
  t.end()
})

test('genNetworkConfig', async t => {
  const c1 = await Builder.network('memory')({ configDir: '' })
  const c2 = await Builder.network('websocket')({ configDir: '' })
  t.equal(c1.type, 'memory')
  t.equal(c1.transport_configs[0].type, 'memory')
  t.equal(c2.type, 'websocket')
  t.equal(c2.transport_configs[0].type, 'websocket')
  t.end()
})

test('genLoggerConfig', async t => {
  const loggerQuiet = await Builder.logger(false)

  const expectedQuiet = TOML.parse(`
[logger]
type = "debug"
state_dump = false
[[logger.rules.rules]]
exclude = true
pattern = ".*"
  `)

  t.deepEqual(loggerQuiet, expectedQuiet)
  t.end()
})

test('genConfig produces JSON which can be serialized to TOML', async t => {
  const stubGetDnaHash = sinon.stub(Gen, 'getDnaHash').resolves('fakehash')
  const seed = Builder.gen(instancesSugared, commonConfig)
  const json = await seed({ configDir: 'dir', adminPort: 1111, zomePort: 2222, uuid: 'uuid', playerName: 'playerName' })
  const toml = TOML.stringify(json)
  const json2 = TOML.parse(toml)
  t.deepEqual(json, json2)
  t.equal(typeof json, 'object')
  t.end()
  stubGetDnaHash.restore()
})

test('invalid config throws nice error', async t => {
  t.throws(() => {
    Builder.gen([
      { id: 'what' }
    ] as any, commonConfig)({
      configDir: 'dir', adminPort: 1111, zomePort: 2222, uuid: 'uuid', playerName: 'playerName'
    }),
      /Tried to use an invalid value/
  })
  t.end()
})
