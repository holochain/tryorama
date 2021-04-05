import test from 'tape-promise/tape'

import { ScenarioApi } from '../../src/api'
import { Orchestrator } from '../../src';

test('API complains if a non-function was used for config', async t => {
  const orchestrator = new Orchestrator({ middleware: undefined })
  const api = new ScenarioApi("description", orchestrator, "uid")
  await t.rejects(
    // @ts-ignore
    api.players([{}]),
    /contains something other than a function/
  )
})
