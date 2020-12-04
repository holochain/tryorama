import * as tape from 'tape'
import { Orchestrator } from '../../src'
import { runSeries, compose, /*singleConductor, machinePerPlayer,*/ localOnly } from '../../src/middleware'
// import { fakeMmmConfigs, spinupLocalCluster } from '../../src/trycp'
import { testConfig } from '../common';
import path from 'path'
process.on('unhandledRejection', error => {
  console.error('****************************');
  console.error('got unhandledRejection:', error);
  console.error('****************************');
});

const dnaLocationLocal = path.join(__dirname, 'link.dna.gz')

const localOrchestrator = (extra = {}) => new Orchestrator({
  middleware: compose(runSeries(), localOnly),
  reporter: true,
  ...extra
})

require('./test-always-on')(localOrchestrator, () => testConfig(dnaLocationLocal))
// require('./test-always-on')(singleConductorOrchestrator, () => testConfig(dnaLocationLocal))
require('./test-dynamic-on')(localOrchestrator, () => testConfig(dnaLocationLocal))
