import * as tape from 'tape'
import tapeP from 'tape-promise'

import { Config } from '../../src'
import * as T from '../../src/types'

const test = tapeP(tape)

module.exports = (testOrchestrator, testConfig) => {

  test('test with kill and respawn', async t => {
    t.plan(4)
    const C = testConfig()
    const orchestrator = testOrchestrator()
    orchestrator.registerScenario('attempted call with killed conductor', async s => {
      const { alice } = await s.players({ alice: C.alice })
      await alice.spawn()

      await t.doesNotReject(
        alice.call('app', 'main', 'commit_entry', {
          content: 'content'
        })
      )

      await alice.kill()

      await t.rejects(
        alice.call('app', 'main', 'commit_entry', {
          content: 'content'
        }),
        /.*no conductor is running.*/
      )
    })

    orchestrator.registerScenario('spawn-kill-spawn', async s => {
      const { alice } = await s.players({ alice: C.alice })
      await alice.spawn()
      await alice.kill()
      await alice.spawn()
      const agentAddress = await alice.call('app', 'main', 'commit_entry', {
        content: 'content'
      })
      t.equal(agentAddress.Ok.length, 46)
    })

    const stats = await orchestrator.run()

    t.equal(stats.successes, 2)
  })

  test('test with no conductor', async t => {
    const C = testConfig()
    const orchestrator = testOrchestrator()
    orchestrator.registerScenario('attempted call with unspawned conductor', async s => {
      const { alice } = await s.players({ alice: C.alice })
      await alice.call('app', 'main', 'commit_entry', {
        content: 'content'
      })
    })

    const stats = await orchestrator.run()

    t.equal(stats.errors.length, 1)
  })

  test('late joiners', async t => {
    const C = testConfig()
    const orchestrator = testOrchestrator()
    orchestrator.registerScenario('late joiners', async s => {
      const { alice } = await s.players({ alice: C.alice }, true)

      const commit1 = await alice.call('app', 'main', 'commit_entry', {
        content: 'content'
      })
      const commit2 = await alice.call('app', 'main', 'commit_entry', {
        content: 'content'
      })
      const hash1 = commit1.Ok
      const hash2 = commit2.Ok

      const linkResult = await alice.call('app', 'main', 'link_entries', {
        base: hash1,
        target: hash2,
      })

      const linkHash = linkResult.Ok

      // bob and carol join later
      const { bob, carol } = await s.players({ bob: C.bob, carol: C.carol }, true)

      // wait for DHT consistency
      if (!await s.simpleConsistency("app", [alice, bob, carol], [])) {
        t.fail("failed to reach consistency")
      }

      // after the consistency waiting inherent in auto-spawning the new players, their state dumps
      // should immediately show that they are holding alice's entries
      const bobDump = await bob.stateDump('app')
      const carolDump = await bob.stateDump('app')

      t.ok(hash1 in bobDump.held_aspects)
      t.ok(hash2 in bobDump.held_aspects)
      t.ok(linkHash in bobDump.held_aspects)
      t.ok(hash1 in carolDump.held_aspects)
      t.ok(hash2 in carolDump.held_aspects)
      t.ok(linkHash in carolDump.held_aspects)

      const bobLinks = await bob.call('app', 'main', 'get_links', {
        base: hash1
      })
      const carolLinks = await carol.call('app', 'main', 'get_links', {
        base: hash1
      })

      // TODO: Determine why links are returned in stateDump, but not returned by get_links
      // t.equal(bobLinks.Ok.links.length, 1)
      // t.equal(carolLinks.Ok.links.length, 1)
    })

    const stats = await orchestrator.run()

    t.equal(stats.successes, 1)
    t.end()
  })

  test('test with hostedPlayers instances and run consistency', async t => {
    const dna = Config.dna("./dna/holofuel.dna.json")
    const common: T.ConductorConfigCommon = {
      logger: Config.logger(true),
      metric_publisher: Config.metricPublisher('logger'),
      network: { type: 'sim2h', sim2h_url: 'ws://holofuel-hc45.sim2h.net:9001' }
      // network: { type: 'sim2h', sim2h_url: 'ws://localhost:9000' }
    }
    const C: T.ConfigSeed = Config.gen({ holofuel: dna }, common)

    const orchestrator = testOrchestrator()
    orchestrator.registerScenario('test with hostedPlayers', async s => {
      const hostedAliceDetails = {
        id: 'holofuel', // hosted agent instance_id
        agent_address: 'HcScivWRCRMeky9xa7k87tpuF5wnEzy5hOUUTphyIa5kw4i7s5dXyJ7ddrxyahz', //hosted agent address
        dna_address: "",
        host_id: '2zwc1vwrjav2199fwmrmirbyyhlj6hyxmkn1m0rojz98c259gq', // test host #1 uri
        host_email: 'joel+hpos1@holo.host', // test host #1 email
        host_password: 'asdfasdf' // test host #1 pwd
      }
      const { bob } = await s.players({ bob: C }, true)
      try{
        const alice = await s.hostedPlayers(hostedAliceDetails)
        t.ok(alice)

        try {
          if (!await s.simpleConsistency('holofuel', [bob], [])) {
              t.fail("failed to reach consistency")
            }
        } catch (error) {
          t.fail("Error while running consistency")
        }
        alice.close()

      } catch(e) {
        console.log("Failed to spin up hostedPlayer", e);
        t.fail("Failed to spin up hostedPlayer")
      }
    })

    const stats = await orchestrator.run()
    t.equal(stats.successes, 1)
  })
}
