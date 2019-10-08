
import { Orchestrator } from '../../src'
import { runSeries, combine, singleConductor } from '../../src/middleware'

const network = {
  type: 'sim1h',
  dynamo_url: 'http://localhost:8000',
}

const seriesOrchestrator = () => new Orchestrator({
  middleware: runSeries,
  reporter: true,
  globalConfig: {
    network,
    logger: true,
  }
})

const singleConductorSeriesOrchestrator = () => new Orchestrator({
  middleware: combine(runSeries, singleConductor),
  reporter: true,
  globalConfig: {
    network,
    logger: true,
  }
})

require('./test-always-on')(seriesOrchestrator)
require('./test-always-on')(singleConductorSeriesOrchestrator)
