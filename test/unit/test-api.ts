const sinon = require('sinon')
import * as tape from 'tape'
import tapeP from 'tape-promise'
const test = tapeP(tape)

import { ScenarioApi } from '../../src/api'
import { instancesDry } from './test-config';
import * as C from '../../src/config';
import * as Gen from '../../src/config/gen';
import { ConfigSeedArgs } from '../../src/types';
import { trace } from '../../src/util';
import { testOrchestrator } from '../common';

test('API detects duplicate agent IDs', async t => {
  const stubGetDnaHash = sinon.stub(Gen, 'getDnaHash').resolves('fakehash')
  const orchestrator = testOrchestrator()
  const api = new ScenarioApi("description", orchestrator, "uuid")
  const args = {
    playerName: 'same',
    uuid: 'also-same',
  } as ConfigSeedArgs
  await t.rejects(
    api.players({
      local: {
        alice: C.gen(instancesDry),
        bob: C.gen(instancesDry)
      }
    }),
    /There are 2 non-unique test agent names specified/
  )
  stubGetDnaHash.restore()
})
