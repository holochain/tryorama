import tape from 'tape'
import { Orchestrator } from '../../src'
import { runSeries, compose, /*singleConductor, machinePerPlayer,*/ localOnly } from '../../src/middleware'
// import { fakeMmmConfigs, spinupLocalCluster } from '../../src/trycp'
import { testConfig } from '../common';
import path from 'path'
import { run_trycp, PORT } from './test-remote'
import testAlwaysOn from './test-always-on'
import testDynamicOn from './test-dynamic-on'
import testSignal from './test-signal'
import testRemote from './test-remote'
process.on('unhandledRejection', error => {
  console.error('****************************');
  console.error('got unhandledRejection:', error);
  console.error('****************************');
});

const dnaLocationLocal = path.join(__dirname, 'test.dna.gz')

const localOrchestrator = (extra = {}) => new Orchestrator({
  middleware: compose(runSeries(), localOnly),
  reporter: true,
  ...extra
})

testAlwaysOn(localOrchestrator, () => testConfig(dnaLocationLocal))
// testAlwaysOn(singleConductorOrchestrator, () => testConfig(dnaLocationLocal))
testDynamicOn(localOrchestrator, () => testConfig(dnaLocationLocal))
testSignal(localOrchestrator, () => testConfig(dnaLocationLocal))

run_trycp().then((child) => {
  testRemote(localOrchestrator, () => testConfig(dnaLocationLocal))
  testAlwaysOn(localOrchestrator, () => testConfig(dnaLocationLocal), `localhost:${PORT}`)
  // testAlwaysOn(singleConductorOrchestrator, () => testConfig(dnaLocationLocal), `localhost:${PORT}`)
  testDynamicOn(localOrchestrator, () => testConfig(dnaLocationLocal), `localhost:${PORT}`)
  testSignal(localOrchestrator, () => testConfig(dnaLocationLocal), `localhost:${PORT}`)
  tape.onFinish(() => child.kill())
}, (error) => { throw error })