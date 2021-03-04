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

const dnaLocationLocal = path.join(__dirname, 'fixture', 'test.dna')

const localOrchestrator = (extra = {}) => new Orchestrator({
  middleware: compose(runSeries(), localOnly),
  reporter: true,
  ...extra
})

//testAlwaysOn(localOrchestrator, () => testConfig(dnaLocationLocal))
// testAlwaysOn(singleConductorOrchestrator, () => testConfig(dnaLocationLocal))
testDynamicOn(localOrchestrator, () => testConfig(dnaLocationLocal))
testSignal(localOrchestrator, () => testConfig(dnaLocationLocal))

const trycp = run_trycp()
const playersRemote = async (s, configs, startup?) => {
  await trycp
  return await s.players(configs, startup, `localhost:${PORT}`, false)
};

testRemote(localOrchestrator, () => testConfig(dnaLocationLocal), playersRemote)
testAlwaysOn(localOrchestrator, () => testConfig(dnaLocationLocal), playersRemote)
// testAlwaysOn(singleConductorOrchestrator, () => testConfig(dnaLocationLocal), playersRemote)
testDynamicOn(localOrchestrator, () => testConfig(dnaLocationLocal), playersRemote)
testSignal(localOrchestrator, () => testConfig(dnaLocationLocal), playersRemote)
tape("killing trycp", async () => {
  (await trycp).kill()
})
