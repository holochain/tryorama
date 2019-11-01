const memoize = require('memoizee')
import { Orchestrator } from '../../src'
import { runSeries, compose, singleConductor, machinePerPlayer, localOnly } from '../../src/middleware'
import { fakeMmmConfigs, spinupLocalCluster } from '../../src/trycp'

const localOrchestrator = () => new Orchestrator({
  middleware: compose(runSeries(), localOnly),
  reporter: true,
  // globalConfig is specified explicitly in common::testConfig in this case
})

const singleConductorOrchestrator = () => new Orchestrator({
  middleware: compose(compose(runSeries(), localOnly), singleConductor),
  reporter: true,
  // globalConfig is specified explicitly in common::testConfig in this case
})

// This is just a simulation of how one might spin up trycp servers to connect to.
// In reality, some other more complicated process would spin up machines and return
// the endpoints.
const trycpEndpoints = memoize(async () => {
  const NUM_MMM = 5
  const config = fakeMmmConfigs(NUM_MMM, 'holochain/holochain-rust:trycp')
  return await spinupLocalCluster(config)
})

const trycpOrchestrator = async () => {
  const endpoints = await trycpEndpoints()
  return new Orchestrator({
    middleware: compose(runSeries(), machinePerPlayer(endpoints)),
    reporter: true,
    // globalConfig is specified explicitly in common::testConfig in this case
  })
}


require('./test-always-on')(localOrchestrator)
require('./test-always-on')(singleConductorOrchestrator)
require('./test-always-on')(trycpOrchestrator)
