const sinon = require('sinon')
const test = require('tape')

import { Orchestrator } from '../../src'
import { tapeExecutor, runSeries } from '../../src/middleware'
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

const orchestratorPlain = new Orchestrator({
  middleware: runSeries()
})

const orchestratorTape = new Orchestrator({
  middleware: tapeExecutor(mockTape)
})

const badTestRunPlain = sinon.spy()
const badTestRunTape = sinon.spy()

orchestratorPlain.registerScenario('perfectly fine test', async (_s) => {

})
orchestratorPlain.registerScenario('error thrown', async (_s) => {
  throw new Error("this gets caught")
})

orchestratorTape.registerScenario('too few arguments', async (_s) => badTestRunTape())
orchestratorTape.registerScenario('too many arguments', async (_s, _t, _x) => badTestRunTape())
orchestratorTape.registerScenario('perfectly fine test', async (_, t) => {
  t.ok(true)
})
orchestratorTape.registerScenario('error thrown', async (_, t) => {
  t.ok(true)
  throw new Error("this gets caught")
})

test('unit executor failure modes', async t => {
  await orchestratorPlain.run().then(stats => {
    t.ok(badTestRunPlain.notCalled)
    t.equal(stats.successes, 1)
    console.log(stats)
    t.ok(String(stats.errors[0].error).includes('this gets caught'))
    t.end()
  })
})

test('tapeExecutor failure modes', async t => {
  await orchestratorTape.run().then(stats => {
    t.ok(badTestRunTape.notCalled)
    t.equal(mockT.ok.callCount, 2)
    t.ok(mockT.fail.calledOnceWith(sinon.match('this gets caught')))
    t.equal(mockT.end.callCount, 2)
    t.equal(stats.successes, 1)
    t.equal(stats.errors.length, 3)
    t.ok(String(stats.errors[0].error).includes('2 arguments'))
    t.ok(String(stats.errors[1].error).includes('2 arguments'))
    t.end()
  })
})
