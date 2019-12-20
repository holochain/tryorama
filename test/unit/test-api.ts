const sinon = require('sinon')
import * as tape from 'tape'
import tapeP from 'tape-promise'
const test = tapeP(tape)

import { ScenarioApi } from '../../src/api'
import { instancesDry } from './test-gen';
import Builder from '../../src/config/builder';
import * as Gen from '../../src/config/gen';
import { ConfigSeedArgs } from '../../src/types';
import { trace } from '../../src/util';
import { Orchestrator } from '../../src';
import { testOrchestrator } from '../common';

test('API detects duplicate agent IDs', async t => {
  const stubGetDnaHash = sinon.stub(Gen, 'getDnaHash').resolves('fakehash')
  const orchestrator = testOrchestrator()
  const api = new ScenarioApi("description", orchestrator, "uuid")
  await t.rejects(
    api.players({
      local: {
        alice: Builder.gen(instancesDry),
        bob: Builder.gen(instancesDry)
      }
    }),
    /There are 2 non-unique test agent names specified/
  )
  stubGetDnaHash.restore()
})

test('API complains if a non-function was used', async t => {
  const stubGetDnaHash = sinon.stub(Gen, 'getDnaHash').resolves('fakehash')
  const orchestrator = new Orchestrator({ middleware: undefined })
  const api = new ScenarioApi("description", orchestrator, "uuid")
  await t.rejects(
    api.players({
      local: {
        alice: Builder.gen(instancesDry),
        bob: instancesDry as any
      }
    }),
    /Config for player 'bob' contains something other than a function/
  )
  stubGetDnaHash.restore()
})
