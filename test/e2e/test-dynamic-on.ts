import * as tape from 'tape'
import tapeP from 'tape-promise'

const test = tapeP(tape)

import { Orchestrator, Config } from '../../src'
import { runSeries } from '../../src/middleware'
import { delay, trace } from '../../src/util';
import { Player } from "../../src/player"


const getStates = async (instance_id, players: Array<Player>): Promise<any> => {
  return Promise.all(players.map(player => player.stateDump(instance_id)))
}


const getPublicEntryHashes = async (instance_id, players: Array<Player>): Promise<any> => {
  var hashes = new Set()
  // using state-dump to get chain data for now, this needs to be a real admin call so we can
  // distinguish private entries
  const states = await getStates(instance_id, players)
  for (const state of states) {
    for (const [element, chain_header] of state["source_chain"]) {
      if (element["header"]["entry_type"] != 'CapTokenGrant') {
        hashes.add(element["header"]["entry_address"])
      }
    }
  }
  return Array.from(hashes)
}

function areHeadersEqualSets(metas) {
  const superSet = {};
  for (const i of metas[0]["headers"]) {
    const e = i + typeof i;
    superSet[e] = 1;
  }
  const playersCount = metas.length
  for (var j = 1; j < playersCount; j++) {
    for (const i of metas[j]["headers"]) {
      const e = i + typeof i;
      if (!superSet[e]) {
        return false;
      }
      superSet[e] += 1;
    }
  }

  for (let e in superSet) {
    if (superSet[e] != playersCount) {
      return false;
    }
  }

  return true;
}

const getMetas = async (instance_id, players: Array<Player>, hash: string): Promise<any> => {
  return Promise.all(players.map(player => player.getMeta(instance_id, hash)))
}

// waits 30 seconds for consistency
const simpleConsistency = async (instance_id, players: Array<Player>): Promise<Boolean> => {
  var retries = 3
  while (!await isConsistent(instance_id, players)) {
    retries--
    if (retries == 0) {
      return false
    }
    console.log("awaiting consistency, pausing for 10 seconds")
    await delay(10000)
  }
  return true
}

// checks to see if players are all holding all the same data
const isConsistent = async (instance_id, players: Array<Player>): Promise<Boolean> => {
  const hashes = await getPublicEntryHashes(instance_id, players)
    console.log("FISH: public entry hashes")
    console.dir(hashes,{depth: null})
  for (const hash of hashes) {
    const metas = await getMetas(instance_id, players, hash)
    console.log("FISH")
    console.dir(metas,{depth: null})
      if (!areHeadersEqualSets(metas)) {
          console.log("FISH: not consistent")
      return false
    }
  }
  return true
}

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
      if (!await simpleConsistency("app", [alice, bob, carol])) {
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

      t.equal(bobLinks.Ok.links.length, 1)
      t.equal(carolLinks.Ok.links.length, 1)
    })

    const stats = await orchestrator.run()

    t.equal(stats.successes, 1)
    t.end()
  })

}
