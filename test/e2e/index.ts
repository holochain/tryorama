
import { Orchestrator } from '../../src'
import { runSeries, combine, singleConductor } from '../../src/middleware'

const singleConductorSeriesOrchestrator = () => new Orchestrator({
  middleware: combine(runSeries, singleConductor),
  reporter: true,
  globalConfig: {
    network: 'n3h',
    logger: true,
  }
})

const seriesOrchestrator = () => new Orchestrator({
  middleware: runSeries,
  reporter: true,
  globalConfig: {
    network: 'n3h',
    logger: true,
  }
})

require('./test-always-on')(singleConductorSeriesOrchestrator)
// require('./test-always-on')(seriesOrchestrator)
