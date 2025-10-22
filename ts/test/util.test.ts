import { AppBundleSource, EntryHash } from "@holochain/client";
import { assert, expect, test } from "vitest";
import {
  Scenario,
  dhtSync,
  integratedOpsCount,
  runScenario,
  storageArc,
} from "../src";
import { FIXTURE_HAPP_URL } from "./fixture";
import { EMPTY_ARC, FULL_ARC } from "./constants";

const TEST_ZOME_NAME = "coordinator";

test("dhtSync - Create multiple entries, read the last, 2 conductors", async () =>
  runScenario(async (scenario: Scenario) => {
    const appBundleSource: AppBundleSource = {
      type: "path",
      value: FIXTURE_HAPP_URL.pathname,
    };
    const [alice, bob] = await scenario.addPlayersWithApps([
      { appBundleSource },
      { appBundleSource },
    ]);

    // Alice and Bob init their cells to trigger creation of InitZomesComplete Ops
    await bob.cells[0].callZome<string>({
      zome_name: TEST_ZOME_NAME,
      fn_name: "init",
      payload: null,
    });
    await alice.cells[0].callZome<string>({
      zome_name: TEST_ZOME_NAME,
      fn_name: "init",
      payload: null,
    });

    // Alice creates 10 entries
    let lastCreatedHash;
    let lastCreatedContent;
    for (let i = 0; i < 10; i++) {
      lastCreatedContent = `Hi dare ${i}`;
      lastCreatedHash = await alice.cells[0].callZome<EntryHash>({
        zome_name: TEST_ZOME_NAME,
        fn_name: "create",
        payload: lastCreatedContent,
      });
    }

    await dhtSync([alice, bob], alice.cells[0].cell_id[0]);

    // Bob gets the last created entry
    const readContent = await bob.cells[0].callZome<string>({
      zome_name: TEST_ZOME_NAME,
      fn_name: "read",
      payload: lastCreatedHash,
    });
    assert.equal(readContent, lastCreatedContent);

    // Alice has no ops in validation or integration limbo
    const aliceDump = await alice.conductor.adminWs().dumpFullState({
      cell_id: alice.cells[0].cell_id,
      dht_ops_cursor: undefined,
    });
    assert.equal(aliceDump.integration_dump.integration_limbo.length, 0);
    assert.equal(aliceDump.integration_dump.validation_limbo.length, 0);

    // Bob has no ops in validation or integration limbo
    const bobDump = await bob.conductor.adminWs().dumpFullState({
      cell_id: bob.cells[0].cell_id,
      dht_ops_cursor: undefined,
    });
    assert.equal(bobDump.integration_dump.integration_limbo.length, 0);
    assert.equal(bobDump.integration_dump.validation_limbo.length, 0);

    // Alice has 52 ops integrated
    assert.equal(aliceDump.integration_dump.integrated.length, 52);

    // Bob has 52 ops integrated
    assert.equal(bobDump.integration_dump.integrated.length, 52);
  }));

test("dhtSync - Fails if some Ops are not synced among all conductors", async () => {
  const scenario = new Scenario({
    disableLocalServices: true,
  });

  const appBundleSource: AppBundleSource = {
    type: "path",
    value: FIXTURE_HAPP_URL.pathname,
  };
  const [alice, bob] = await scenario.addPlayersWithApps([
    { appBundleSource },
    { appBundleSource },
  ]);

  // Alice creates 1 entry
  await alice.cells[0].callZome<EntryHash>({
    zome_name: TEST_ZOME_NAME,
    fn_name: "create",
    payload: "my entry",
  });

  // Bob does not receive the entry within the timeout.
  // A 0ms timeout does one check for dht, then times out.
  try {
    await dhtSync([alice, bob], alice.cells[0].cell_id[0], undefined, 0);
    assert.fail();
  } catch {
    assert(true);
  } finally {
    await scenario.cleanUp();
  }
});

test("storageArc - Succeeds for 2 conductors, both start as empty arc, one creates an entry, both reach full arc", async () =>
  runScenario(async (scenario: Scenario) => {
    const appBundleSource: AppBundleSource = {
      type: "path",
      value: FIXTURE_HAPP_URL.pathname,
    };
    const [alice, bob] = await scenario.addPlayersWithApps([
      { appBundleSource },
      { appBundleSource },
    ]);

    // Alice & Bob have empty storage arcs
    await Promise.all([
      storageArc(alice, alice.cells[0].cell_id[0], EMPTY_ARC),
      storageArc(bob, alice.cells[0].cell_id[0], EMPTY_ARC),
    ]);

    // Alice and Bob have full storage arcs
    await Promise.all([
      storageArc(alice, alice.cells[0].cell_id[0], FULL_ARC),
      storageArc(bob, alice.cells[0].cell_id[0], FULL_ARC),
    ]);
  }));

test("storageArc - Fails for only 1 conductor which never reaches full storage arc", async () =>
  runScenario(async (scenario: Scenario) => {
    const appBundleSource: AppBundleSource = {
      type: "path",
      value: FIXTURE_HAPP_URL.pathname,
    };
    const [alice] = await scenario.addPlayersWithApps([{ appBundleSource }]);

    // Alice never reaches full storage arc
    await expect(
      storageArc(alice, alice.cells[0].cell_id[0], FULL_ARC),
    ).rejects.toThrow();
  }));

test("integratedOpsCount - Succeeds when integrated Ops count matches", () =>
  runScenario(async (scenario: Scenario) => {
    const appBundleSource: AppBundleSource = {
      type: "path",
      value: FIXTURE_HAPP_URL.pathname,
    };
    const alice = await scenario.addPlayerWithApp({ appBundleSource });

    // Create a cap grant authorizing alice's key to sign zome calls,
    // which internally also triggers zome initialization.
    //
    // In tryorama, this authorization happens automatically at a Player's first zome call.
    // Here we do it manually so we can track which Ops will be created directly by subsequent zome calls.
    await alice.conductor
      .adminWs()
      .authorizeSigningCredentials(alice.cells[0].cell_id);
    await integratedOpsCount(alice, alice.cells[0].cell_id, 11);

    // Create an entry
    await alice.cells[0].callZome<string>({
      zome_name: TEST_ZOME_NAME,
      fn_name: "create",
      payload: "1",
    });

    // This should integrate 3 more ops
    await integratedOpsCount(alice, alice.cells[0].cell_id, 14);

    // Create a private entry
    await alice.cells[0].callZome<string>({
      zome_name: TEST_ZOME_NAME,
      fn_name: "create_private",
      payload: "1",
    });

    // This should integrate 2 more ops
    await integratedOpsCount(alice, alice.cells[0].cell_id, 16);
  }));

test("integratedOpsCount - Fails if timeout reached before integrated ops count matches", async () =>
  runScenario(async (scenario: Scenario) => {
    const appBundleSource: AppBundleSource = {
      type: "path",
      value: FIXTURE_HAPP_URL.pathname,
    };
    const alice = await scenario.addPlayerWithApp({ appBundleSource });

    // Trigger integration workflow by calling 'init'
    // This is a workaround for https://github.com/holochain/holochain/issues/5363
    await alice.cells[0].callZome<string>({
      zome_name: TEST_ZOME_NAME,
      fn_name: "init",
      payload: null,
    });

    try {
      await integratedOpsCount(alice, alice.cells[0].cell_id, 0);
      assert.fail();
    } catch {
      assert.ok(
        "integratedOpsCount threw an error because ops count did not match after timeout",
      );
    }
  }));
