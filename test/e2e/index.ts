import * as tape from 'tape'
import { Orchestrator } from '../../src'
import { runSeries, compose, singleConductor, machinePerPlayer, localOnly } from '../../src/middleware'
// import { fakeMmmConfigs, spinupLocalCluster } from '../../src/trycp'
import { testConfig } from '../common';

process.on('unhandledRejection', error => {
  console.error('****************************');
  console.error('got unhandledRejection:', error);
  console.error('****************************');
});

const dnaLocationLocal = './dna/passthrough-dna.dna.json'
const dnaLocationRemote = 'https://github.com/holochain/passthrough-dna/releases/download/v0.0.6/passthrough-dna.dna.json'

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
// const trycpEndpoints = async () => {
//   const NUM_MMM = 3
//   const config = fakeMmmConfigs(NUM_MMM, 'holochain/holochain-rust:trycp')
//   console.log('config:', config)
//   // const endpoints = await spinupLocalCluster(config, false)
//   console.log('endpoints:', endpoints)
//   return endpoints
// }

// const trycpOrchestrator = (endpoints) => () => {
//   return new Orchestrator({
//     middleware: compose(runSeries(), machinePerPlayer(endpoints)),
//     reporter: true,
//     // globalConfig is specified explicitly in common::testConfig in this case
//   })
// }


require('./test-always-on')(localOrchestrator, () => testConfig(dnaLocationLocal))
require('./test-always-on')(singleConductorOrchestrator, () => testConfig(dnaLocationLocal))

require('./test-dynamic-on')(localOrchestrator, () => testConfig(dnaLocationLocal))

// trycpEndpoints().then(([endpoints, processes]) => {
//   require('./test-always-on')(trycpOrchestrator(endpoints), () => testConfig(dnaLocationRemote))
//   tape('extra dummy test for cleanup', t => {
//     console.log("All done. Killing locally spawned processes.")
//     processes.forEach(p => p.kill())
//     t.end()
//   })
// })
