import {
  AppBundleSource,
  EntryHash,
} from "@holochain/client";
import { assert, test,  } from "vitest";
import {
  Scenario,
  dhtSync,
} from "../src";
import { FIXTURE_HAPP_URL } from "./fixture";

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