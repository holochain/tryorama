import test from 'tape-promise/tape'
import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import * as fs from 'fs'
import * as yaml from 'yaml';
import * as T from '../../src/types'

export const PORT = 9000

export const run_trycp = (port = PORT): Promise<ChildProcessWithoutNullStreams> => {
    const trycp = spawn('cargo', ['run', '--release', '--target-dir', '../../target', '--', '-p', port.toString(), '-r', '9100-9200'], { cwd: "crates/trycp_server" })

    trycp.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`)
    });

    return new Promise((resolve) => trycp.stdout.on('data', (data) => {
        const regex = new RegExp("waiting for connections on port " + port);
        if (regex.test(data)) {
            resolve(trycp)
        }
        console.log(`stdout: ${data}`)
    }))
}


export default (testOrchestrator, testConfig, playersFn) => {
    test('test trycp-specific behavior', async t => {
        const [aliceConfig, installApps] = testConfig()
        const orchestrator = testOrchestrator()

        orchestrator.registerScenario('check config', async s => {
            const [alice] = await playersFn(s, [aliceConfig], false)
            const config_data = await new Promise<string>((resolve, reject) => {
                fs.readFile('/tmp/trycp/players/c0/conductor-config.yml', 'utf8', (err, data) => {
                    if (err) {
                        reject(err)
                    }
                    resolve(data)
                })
            })
            const config = yaml.parse(config_data)
            t.equal(config.signing_service_uri, null)
            t.equal(config.encryption_service_uri, null)
            t.equal(config.decryption_service_uri, null)
            t.deepEqual(config.network, { transport_pool: [{ type: 'quic' }] })
            t.equal(config.dpki, null)
        })

        orchestrator.registerScenario('download dna and attempt call', async s => {
            const [alice] = await playersFn(s, [aliceConfig], false)
            await alice.startup()
            const install: T.InstallAgentsHapps = [
                // agent 0
                [{
                    // happ 0
                    hAppId: null,
                    dnas: [
                        // cell 0
                        { url: `file://${installApps[0][0][0]}` }
                    ]
                }]
            ]
            const [[alice_happ]] = await alice.installAgentsHapps(install)
            const [link_cell] = alice_happ.cells
            await t.doesNotReject(
                link_cell.call('test', 'create_link')
            )
        })

        const stats = await orchestrator.run()

        t.equal(stats.successes, 2)
        t.end()
    })
}
