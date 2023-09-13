import {
  AppBundleSource,
  AppSignal,
  AppSignalCb,
  EntryHash,
} from "@holochain/client";
import assert from "node:assert/strict";
import test from "tape-promise/tape.js";
import { getZomeCaller } from "../../src/common.js";
import { Scenario, runScenario } from "../../src/local/scenario.js";
import { FIXTURE_HAPP_URL } from "../fixture/index.js";
import { dhtSync } from "../../src/util.js";

const TEST_ZOME_NAME = "coordinator";

test("Local Scenario - runScenario - Install hApp bundle and access cells through role ids", async (t) => {
  await runScenario(async (scenario: Scenario) => {
    const alice = await scenario.addPlayerWithApp({
      path: FIXTURE_HAPP_URL.pathname,
    });
    t.ok(alice.namedCells.get("test"));
  });
});

test("Local Scenario - runScenario - Catch error when calling non-existent zome", async (t) => {
  await runScenario(async (scenario: Scenario) => {
    const alice = await scenario.addPlayerWithApp({
      path: FIXTURE_HAPP_URL.pathname,
    });

    await t.rejects(
      alice.cells[0].callZome<EntryHash>({
        zome_name: "NOZOME",
        fn_name: "create",
      })
    );
  });
});

test("Local Scenario - runScenario - Catch error when attaching a protected port", async (t) => {
  await runScenario(async (scenario: Scenario) => {
    const alice = await scenario.addPlayerWithApp({
      path: FIXTURE_HAPP_URL.pathname,
    });

    await t.rejects(alice.conductor.attachAppInterface({ port: 300 }));
  });
});

test("Local Scenario - runScenario - Catch error when calling a zome of an undefined cell", async (t) => {
  await runScenario(async (scenario: Scenario) => {
    const alice = await scenario.addPlayerWithApp({
      path: FIXTURE_HAPP_URL.pathname,
    });

    t.throws(() => alice.cells[2].callZome({ zome_name: "", fn_name: "" }));
  });
});

test("Local Scenario - runScenario - Catch error that occurs in a signal handler", async (t) => {
  await runScenario(async (scenario: Scenario) => {
    let signalHandlerAlice: AppSignalCb | undefined;
    const signalReceivedAlice = new Promise<AppSignal>((_, reject) => {
      signalHandlerAlice = () => {
        reject();
      };
    });

    const alice = await scenario.addPlayerWithApp({
      path: FIXTURE_HAPP_URL.pathname,
    });
    assert(signalHandlerAlice);
    assert("on" in alice.appAgentWs);
    alice.appAgentWs.on("signal", signalHandlerAlice);

    const signalAlice = { value: "hello alice" };
    alice.cells[0].callZome({
      zome_name: TEST_ZOME_NAME,
      fn_name: "signal_loopback",
      payload: signalAlice,
    });

    await t.rejects(signalReceivedAlice);
  });
});

test("Local Scenario - Install hApp bundle and access cell by role name", async (t) => {
  const scenario = new Scenario();

  const alice = await scenario.addPlayerWithApp({
    path: FIXTURE_HAPP_URL.pathname,
  });
  t.ok(alice.namedCells.get("test"));
  await scenario.cleanUp();
});

test("Local Scenario - Add players with hApp bundles", async (t) => {
  const scenario = new Scenario();
  t.ok(scenario.networkSeed);
  const [alice, bob] = await scenario.addPlayersWithApps([
    { appBundleSource: { path: FIXTURE_HAPP_URL.pathname } },
    { appBundleSource: { path: FIXTURE_HAPP_URL.pathname } },
  ]);
  t.ok(alice.namedCells.get("test"));
  t.ok(bob.namedCells.get("test"));

  await scenario.cleanUp();
});

test("Local Scenario - Create and read an entry, 2 conductors", async (t) => {
  //The wrapper takes care of creating a scenario and shutting down or deleting
  // all conductors involved in the test scenario.
  await runScenario(async (scenario) => {
    // Construct proper paths for a hApp file created by the `hc app pack` command.
    const appBundleSource: AppBundleSource = {
      path: FIXTURE_HAPP_URL.pathname,
    };

    // Add 2 players with the test hApp to the Scenario. The returned players
    // can be destructured.
    const [alice, bob] = await scenario.addPlayersWithApps([
      { appBundleSource },
      { appBundleSource },
    ]);

    // Content to be passed to the zome function that create an entry,
    const content = "Hello Tryorama";

    // The cells of the installed hApp are returned in the same order as the DNAs
    // in the app manifest.
    const createEntryHash = await alice.cells[0].callZome<EntryHash>({
      zome_name: TEST_ZOME_NAME,
      fn_name: "create",
      payload: content,
    });

    // Wait for the created entry to be propagated to the other player.
    await dhtSync([alice, bob], alice.cells[0].cell_id[0]);

    // Using the same cell and zome as before, the second player reads the
    // created entry.
    const readContent = await bob.cells[0].callZome<typeof content>({
      zome_name: TEST_ZOME_NAME,
      fn_name: "read",
      payload: createEntryHash,
    });
    t.equal(readContent, content);
  });
});

test("Local Scenario - Conductor maintains data after shutdown and restart", async (t) => {
  const scenario = new Scenario();
  const appBundleSource: AppBundleSource = { path: FIXTURE_HAPP_URL.pathname };
  const [alice, bob] = await scenario.addPlayersWithApps([
    { appBundleSource },
    { appBundleSource },
  ]);
  // Get shortcut functions to call a specific zome of a specific agent
  const aliceCaller = getZomeCaller(alice.cells[0], TEST_ZOME_NAME);
  const bobCaller = getZomeCaller(bob.cells[0], TEST_ZOME_NAME);

  const content = "Before shutdown";
  // Use the curried function to call alice's coordinator zome
  const createEntryHash = await aliceCaller<EntryHash>("create", content);

  await dhtSync([alice, bob], alice.cells[0].cell_id[0]);

  const readContent = await bobCaller<typeof content>("read", createEntryHash);
  t.equal(readContent, content);

  await bob.conductor.shutDown();
  t.throws(bob.conductor.adminWs);

  await bob.conductor.startUp();
  const [appInterfacePort] = await bob.conductor.adminWs().listAppInterfaces();
  bob.appAgentWs = await bob.conductor.connectAppAgentWs(
    appInterfacePort,
    bob.appId
  );
  const readContentAfterRestart: typeof content = await bob.appAgentWs.callZome(
    {
      cell_id: bob.cells[0].cell_id,
      zome_name: TEST_ZOME_NAME,
      fn_name: "read",
      payload: createEntryHash,
    }
  );
  t.equal(readContentAfterRestart, content);

  await scenario.cleanUp();
});

test("Local Scenario - Receive signals with 2 conductors", async (t) => {
  const scenario = new Scenario();

  let signalHandlerAlice: AppSignalCb | undefined;
  const signalReceivedAlice = new Promise<AppSignal>((resolve) => {
    signalHandlerAlice = (signal) => {
      resolve(signal);
    };
  });

  let signalHandlerBob: AppSignalCb | undefined;
  const signalReceivedBob = new Promise<AppSignal>((resolve) => {
    signalHandlerBob = (signal) => {
      resolve(signal);
    };
  });

  const appBundleSource: AppBundleSource = { path: FIXTURE_HAPP_URL.pathname };
  const [alice, bob] = await scenario.addPlayersWithApps([
    { appBundleSource },
    { appBundleSource },
  ]);
  assert(signalHandlerAlice);
  assert("on" in alice.appAgentWs);
  alice.appAgentWs.on("signal", signalHandlerAlice);
  assert(signalHandlerBob);
  assert("on" in bob.appAgentWs);
  bob.appAgentWs.on("signal", signalHandlerBob);

  const signalAlice = { value: "hello alice" };
  alice.cells[0].callZome({
    zome_name: TEST_ZOME_NAME,
    fn_name: "signal_loopback",
    payload: signalAlice,
  });
  const signalBob = { value: "hello bob" };
  bob.cells[0].callZome({
    zome_name: TEST_ZOME_NAME,
    fn_name: "signal_loopback",
    payload: signalBob,
  });

  const [actualSignalAlice, actualSignalBob] = await Promise.all([
    signalReceivedAlice,
    signalReceivedBob,
  ]);
  t.deepEqual(actualSignalAlice.payload, signalAlice);
  t.deepEqual(actualSignalBob.payload, signalBob);

  await scenario.cleanUp();
});

test("Local Scenario - pauseUntilDhtEqual - Create multiple entries, read the last, 2 conductors", async (t) => {
  const scenario = new Scenario();

  const appBundleSource: AppBundleSource = { path: FIXTURE_HAPP_URL.pathname };
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
  t.equal(readContent, lastCreatedContent);

  await scenario.cleanUp();
});
