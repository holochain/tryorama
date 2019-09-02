const sinon = require('sinon')
const test = require('tape')

import { Orchestrator } from '../../src'
import { tapeExecutor } from '../../src/middleware'
import { genConfigArgs, spawnConductor } from '../common'
import logger from '../../src/logger';

const createMockTape = () => {
  const api = {
    ok: sinon.spy(),
    fail: sinon.spy(),
    end: sinon.spy(),
  }
  const runner = (_desc, f) => f(api)
  return { runner, api }
}

const { runner: mockTape, api: mockT } = createMockTape()

const orchestrator = new Orchestrator({
  spawnConductor, genConfigArgs,
  middleware: tapeExecutor(mockTape)
})

const badTestRun = sinon.spy()

orchestrator.registerScenario('too few arguments', async (_s) => badTestRun())
orchestrator.registerScenario('too many arguments', async (_s, _t, _x) => badTestRun())
orchestrator.registerScenario('error thrown', async (_, t) => {
  t.ok(true)
  throw new Error("this gets caught")
})

test('tapeExecutor failure modes', async t => {
  await orchestrator.run().then(stats => {
    t.ok(badTestRun.notCalled)
    t.ok(mockT.ok.calledOnce)
    console.log('stats', stats)
    t.ok(String(stats.errors[0].error).includes('2 arguments'))
    t.ok(String(stats.errors[1].error).includes('2 arguments'))
    t.ok(String(stats.errors[2].error).includes('this gets caught'))
    t.end()
  })
})
