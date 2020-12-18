import * as tape from 'tape'
import test from 'tape-promise/tape'

import { ScenarioApi } from '../../src/api';
import { delay } from '../../src/util';

module.exports = (testOrchestrator, testConfig) => {
    test('test with emit signal', async t => {
        t.plan()
        const [conductorConfig, installApps] = testConfig()
        const orchestrator = await testOrchestrator()
        orchestrator.registerScenario('loopback signal zome call', async (s: ScenarioApi) => {
            const sentPayload = {value: "foo"};
            const [alice] = await s.players([conductorConfig])
            alice.setSignalHandler((signal) => {
                console.log("Received Signal:",signal)
                t.deepEqual(signal.data.payload, sentPayload)
            })
            const [[alice_happ]] = await alice.installAgentsHapps(installApps)
            await alice_happ.cells[0].call('test', 'signal_loopback', sentPayload);
        })
        const stats = await orchestrator.run()
        t.equal(stats.successes, 1, 'only success')
        t.equal(stats.errors.length, 0, 'no errors')
        console.log(stats)
        t.end()
    })
}
