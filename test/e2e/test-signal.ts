import test from 'tape-promise/tape'

import { ScenarioApi } from '../../src/api';

export default (testOrchestrator, testConfig, playersFn = (s, ...args) => s.players(...args)) => {
    test('test with emit signal', async t => {
        const [conductorConfig, installApps] = testConfig()
        const orchestrator = await testOrchestrator()
        orchestrator.registerScenario('loopback signal zome call', async (s: ScenarioApi) => {
            const sentPayload = { value: "foo" };
            const [alice] = await playersFn(s, [conductorConfig])
            let signalPromise = new Promise<void>((resolve) => alice.setSignalHandler((signal) => {
                console.log("Received Signal:", signal)
                t.deepEqual(signal.data.payload, sentPayload)
                resolve()
            }))
            const [[alice_happ]] = await alice.installAgentsHapps(installApps)
            await alice_happ.cells[0].call('test', 'signal_loopback', sentPayload);
            await signalPromise
        })

        const stats = await orchestrator.run()
        t.equal(stats.successes, 1, 'only success')
        t.equal(stats.errors.length, 0, 'no errors')
        console.log(stats)
        t.end()
    })
}
