
const sinon = require('sinon')
const test = require('tape')

import { Orchestrator, Config } from '../../src'
import { runSeries } from '../../src/middleware'
import { delay } from '../../src/util'
import { testConfig, withClock } from '../common'

const testOrchestrator = () => new Orchestrator({
  middleware: runSeries,
  reporter: true,
})

test.skip('zome call softTimeout', withClock(async (t, clk) => {
  // TODO
}))