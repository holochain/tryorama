import { AppBundleSource, EntryHash } from "@holochain/client";
import { assert, expect, test } from "vitest";
import { Scenario, dhtSync, integratedOpsCount, storageArc } from "../src";
import { FIXTURE_HAPP_URL } from "./fixture";
import { EMPTY_ARC, FULL_ARC } from "./constants";

const TEST_ZOME_NAME = "coordinator";

test("dhtSync - Create multiple entries, read the last, 2 conductors", async () => {
  const scenario = new Scenario();

  const appBundleSource: AppBundleSource = {
    type: "path",
    value: FIXTURE_HAPP_URL.pathname,
  };
  const [alice, bob] = await scenario.addPlayersWithApps([
    { appBundleSource },
    { appBundleSource },
  ]);

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

  await scenario.cleanUp();
});

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

  // Bob never receives the entry
  try {
    await dhtSync([alice, bob], alice.cells[0].cell_id[0], undefined, 5000);
    assert.fail();
  } catch {
    assert(true);
  }

  await scenario.cleanUp();
});

test("dhtSync - Fails if some Ops are not integrated in a conductor", async () => {
  const scenario = new Scenario();

  const appBundleSource: AppBundleSource = {
    type: "path",
    value: FIXTURE_HAPP_URL.pathname,
  };
  const [alice, bob] = await scenario.addPlayersWithApps([
    { appBundleSource },
    { appBundleSource },
  ]);

  // Alice creates 1 entry, but never publishes it because publishing is disabled
  await alice.cells[0].callZome<EntryHash>({
    zome_name: TEST_ZOME_NAME,
    fn_name: "create",
    payload: "my entry",
  });

  const x = true;
  while (x) {
    // Dump Bob's conductor state
    const bobStateDump = await bob.conductor.adminWs().dumpFullState({
      cell_id: alice.cells[0].cell_id,
      dht_ops_cursor: undefined,
    });

    // When Bob recieves Alice's Ops, and they are being validated,
    // then dhtSync should fail
    if (bobStateDump.integration_dump.validation_limbo.length > 0) {
      try {
        // Run with a 0ms timeout, so that we check the sync status only *once*,
        // while Bob's conductor is still in this state.
        await dhtSync([alice], alice.cells[0].cell_id[0], 500, 0);
        assert.fail();
      } catch {
        assert(true);
      }
      break;
    }
  }

  await scenario.cleanUp();
});

test("storageArc - Succeeds for 2 conductors, both start as empty arc, one creates an entry, both reach full arc", async () => {
  const scenario = new Scenario();
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

  await scenario.cleanUp();
});

test("storageArc - Fails for only 1 conductor which never reaches full storage arc", async () => {
  const scenario = new Scenario();

  const appBundleSource: AppBundleSource = {
    type: "path",
    value: FIXTURE_HAPP_URL.pathname,
  };
  const [alice] = await scenario.addPlayersWithApps([{ appBundleSource }]);

  // Alice never reaches full storage arc
  await expect(
    storageArc(alice, alice.cells[0].cell_id[0], FULL_ARC),
  ).rejects.toThrow();

  await scenario.cleanUp();
});

test("integratedOpsCount - Counts Ops published on first zome call", async () => {
  const scenario = new Scenario();

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

  await integratedOpsCount(alice, alice.cells[0].cell_id, 9);

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
});

test("integratedOpsCount - Fails if timeout reached before integrated ops count matches", async () => {
  const scenario = new Scenario();

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
});
