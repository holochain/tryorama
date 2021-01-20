import test from 'tape-promise/tape'
import { ChildProcess, ChildProcessWithoutNullStreams, spawn } from 'child_process'
import * as fs from 'fs'
import * as yaml from 'yaml';
import * as T from '../../src/types'

const PORT = 9000

async function run_trycp(port): Promise<ChildProcessWithoutNullStreams> {
    const trycp = await spawn('cargo', ['run', '--', '-p', port, '-r', '9100-9200'], { cwd: "crates/trycp_server" })

    trycp.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`)
    });

    return await new Promise((resolve) => trycp.stdout.on('data', (data) => {
        var regex = new RegExp("waiting for connections on port " + port);
        if (regex.test(data)) {
            resolve(trycp)
        }
        console.log(`stdout: ${data}`)
    }))
}


module.exports = (testOrchestrator, testConfig) => {

    test('test remote with shutdown and startup', async t => {
        const trycp = await run_trycp(PORT)
        const [aliceConfig, installApps] = testConfig()
        const orchestrator = testOrchestrator()

        orchestrator.registerScenario('attempted call with stopped conductor', async s => {
            const [alice] = await s.playersRemote([aliceConfig], `localhost:${PORT}`)
            await alice.startup()
            const [[alice_happ]] = await alice.installAgentsHapps(installApps)
            const [link_cell] = alice_happ.cells
            await t.doesNotReject(
                link_cell.call('test', 'create_link')
            )
            await alice.shutdown()
            await t.rejects(
                link_cell.call('test', 'create_link')
                /* no conductor is running.*/
            )
        })

        orchestrator.registerScenario('start-stop-start', async s => {
            const [alice] = await s.playersRemote([aliceConfig], `localhost:${PORT}`)
            await alice.startup()
            await alice.shutdown()
            await alice.startup()
        })

        orchestrator.registerScenario('check config', async s => {
            const [alice] = await s.playersRemote([aliceConfig], `localhost:${PORT}`)
            const config_data = (await fs.promises.readFile('/tmp/trycp/players/c0/conductor-config.yml')).toString()
            const config = yaml.parse(config_data)
            t.equal(config.signing_service_uri, null)
            t.equal(config.encryption_service_uri, null)
            t.equal(config.decryption_service_uri, null)
            t.deepEqual(config.network, { transport_pool: [{ type: 'quic' }] })
            t.equal(config.dpki, null)
        })

        orchestrator.registerScenario('download dna and attempt call with stopped conductor', async s => {
            const [alice] = await s.playersRemote([aliceConfig], `localhost:${PORT}`)
            await alice.startup()
            const install: T.InstallAgentsHapps = [
                // agent 0
                [
                    // happ 0
                    [
                        // cell 0
                        { url: `file://${installApps[0][0][0].path}` }
                    ]
                ]
            ]
            const [[alice_happ]] = await alice.installAgentsHapps(install)
            const [link_cell] = alice_happ.cells
            await t.doesNotReject(
                link_cell.call('test', 'create_link')
            )
            await alice.shutdown()
            await t.rejects(
                link_cell.call('test', 'create_link')
                /* no conductor is running.*/
            )
        })

        const stats = await orchestrator.run()

        t.equal(stats.successes, 4)
        t.end()
        trycp.kill("SIGTERM")
    })
}
