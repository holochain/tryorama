const sinon = require('sinon')
import * as tape from 'tape'
import tapeP from 'tape-promise'
const test = tapeP(tape)

import { Orchestrator } from '../../src';
import { ScenarioApi } from '../../src/api'
import { configSugared } from './test-config';
import * as C from '../../src/config';
import * as Gen from '../../src/config/gen';
import { GenConfigArgs } from '../../src/types';

test('API detects duplicate agent IDs', async t => {
  const stubGetDnaHash = sinon.stub(Gen, 'getDnaHash').resolves('fakehash')
  const orchestrator = new Orchestrator()
  const api = new ScenarioApi("description", orchestrator, "uuid")
  const args = {
    conductorName: 'same',
    uuid: 'also-same',
  } as GenConfigArgs
  await t.rejects(
    api.players({
      alice: C.desugarConfig(args, configSugared),
      bob: C.desugarConfig(args, configSugared)
    }),
    /There are 2 non-unique test agent IDs specified/
  )
  stubGetDnaHash.restore()
})