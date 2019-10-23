
import { Orchestrator } from '../../src'
import { runSeries, combine, singleConductor } from '../../src/middleware'

const network = {
  type: 'sim1h',
  dynamo_url: 'http://localhost:8000',
}

const seriesOrchestrator = () => new Orchestrator({
  middleware: runSeries,
  reporter: true,
  // globalConfig is specified explicitly in testConfig in this case
})

const singleConductorSeriesOrchestrator = () => new Orchestrator({
  middleware: combine(runSeries, singleConductor),
  reporter: true,
  // globalConfig is specified explicitly in testConfig in this case
})

require('./test-always-on')(seriesOrchestrator)
require('./test-always-on')(singleConductorSeriesOrchestrator)
