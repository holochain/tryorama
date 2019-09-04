const sinon = require('sinon')
import * as tape from 'tape'
import tapeP from 'tape-promise'
const test = tapeP(tape)

import { Orchestrator } from '../../src';
import { ScenarioApi } from '../../src/api'
import { configSugared } from './test-config';
import * as C from '../../src/config';

test.only('API detects duplicate agent IDs', async t => {
  const stubGetDnaHash = sinon.stub(C, 'getDnaHash').resolves('fakehash')
  const orchestrator = new Orchestrator()
  const api = new ScenarioApi("description", orchestrator, "uuid")

  await t.rejects(
    api.players({
      alice: C.desugarConfig('same', configSugared),
      bob: C.desugarConfig('same', configSugared)
    }),
    /There are 2 non-unique test agent IDs specified/
  )
  stubGetDnaHash.restore()
})