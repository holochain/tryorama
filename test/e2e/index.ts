
import { Orchestrator } from '../../src'
import { runSeries, combine, singleConductor, machinePerPlayer, localOnly } from '../../src/middleware'

const network = {
  type: 'sim1h',
  dynamo_url: 'http://localhost:8000',
}

const localOrchestrator = () => new Orchestrator({
  middleware: combine(runSeries, localOnly),
  reporter: true,
  // globalConfig is specified explicitly in testConfig in this case
})

const mrmmOrchestrator = () => new Orchestrator({
  middleware: combine(runSeries, machinePerPlayer('MOCK')),
  reporter: true,
  // globalConfig is specified explicitly in testConfig in this case
})

const singleConductorOrchestrator = () => new Orchestrator({
  middleware: combine(runSeries, singleConductor, localOnly),
  reporter: true,
  // globalConfig is specified explicitly in testConfig in this case
})

// require('./test-always-on')(localOrchestrator)
// require('./test-always-on')(singleConductorOrchestrator)
require('./test-always-on')(mrmmOrchestrator)
