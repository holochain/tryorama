import {
  ActionHash,
  AppBundleSource,
  AppSignal,
  EntryHash,
  Signal,
  SignalCb,
} from "@holochain/client";
import yaml from "js-yaml";
import { readFileSync } from "node:fs";
import { assert, test, expect } from "vitest";
import {
  AppWithOptions,
  CONDUCTOR_CONFIG,
  Scenario,
  dhtSync,
  getZomeCaller,
  runScenario,
} from "../src";
import { FIXTURE_HAPP_URL } from "./fixture";

const TEST_ZOME_NAME = "coordinator";

test("runScenario - Install hApp bundle and access cells through role ids", async () => {
  await runScenario(async (scenario: Scenario) => {
    const alice = await scenario.addPlayerWithApp({
      appBundleSource: {
        type: "path",
        value: FIXTURE_HAPP_URL.pathname,
      },
    });
    assert.ok(alice.namedCells.get("test"));
  });
});

test("runScenario - Catch error when calling non-existent zome", async () => {
  await runScenario(async (scenario: Scenario) => {
    const alice = await scenario.addPlayerWithApp({
      appBundleSource: {
        type: "path",
        value: FIXTURE_HAPP_URL.pathname,
      },
    });

    await expect(
      alice.cells[0].callZome<EntryHash>({
        zome_name: "NOZOME",
        fn_name: "create",
      }),
    ).rejects.toThrow();
  });
});

test("runScenario - Catch error when attaching a protected port", async () => {
  await runScenario(async (scenario: Scenario) => {
    const alice = await scenario.addPlayerWithApp({
      appBundleSource: {
        type: "path",
        value: FIXTURE_HAPP_URL.pathname,
      },
    });

    await expect(
      alice.conductor.attachAppInterface({ port: 300, allowed_origins: "*" }),
    ).rejects.toThrow();
  });
});

test("runScenario - Catch error when calling a zome of an undefined cell", async () => {
  await runScenario(async (scenario: Scenario) => {
    const alice = await scenario.addPlayerWithApp({
      appBundleSource: {
        type: "path",
        value: FIXTURE_HAPP_URL.pathname,
      },
    });

    assert.throws(() =>
      alice.cells[2].callZome({ zome_name: "", fn_name: "" }),
    );
  });
});

test.sequential(
  "runScenario - Catch error that occurs in a signal handler",
  async () => {
    await runScenario(async (scenario: Scenario) => {
      let signalHandlerAlice: SignalCb | undefined;
      const signalReceivedAlice = new Promise<Signal>((_, reject) => {
        signalHandlerAlice = () => {
          reject();
        };
      });

      const alice = await scenario.addPlayerWithApp({
        appBundleSource: {
          type: "path",
          value: FIXTURE_HAPP_URL.pathname,
        },
      });
      assert.ok(signalHandlerAlice);
      assert.ok("on" in alice.appWs);
      alice.appWs.on("signal", signalHandlerAlice);

      const signalAlice = { value: "hello alice" };
      alice.cells[0].callZome({
        zome_name: TEST_ZOME_NAME,
        fn_name: "signal_loopback",
        payload: signalAlice,
      });

      await expect(signalReceivedAlice).rejects.toThrow();
    });
  },
);

test("Set custom network config", async () => {
  const scenario = new Scenario();
  const initiateIntervalMs = 10_000;
  const minInitiateIntervalMs = 20_000;

  const alice = await scenario.addPlayerWithApp({
    appBundleSource: {
      type: "path",
      value: FIXTURE_HAPP_URL.pathname,
    },
    options: { networkConfig: { initiateIntervalMs, minInitiateIntervalMs } },
  });

  const tmpDirPath = alice.conductor.getTmpDirectory();
  const conductorConfig = yaml.load(
    readFileSync(`${tmpDirPath}/${CONDUCTOR_CONFIG}`, { encoding: "utf-8" }),
  );
  assert.ok(
    conductorConfig &&
      typeof conductorConfig === "object" &&
      "network" in conductorConfig,
  );
  const { network } = conductorConfig;
  assert.ok(network && typeof network === "object" && "advanced" in network);
  const { advanced } = network;
  assert.ok(advanced && typeof advanced === "object" && "k2Gossip" in advanced);
  const { k2Gossip } = advanced;
  assert.ok(
    k2Gossip &&
      typeof k2Gossip === "object" &&
      "initiateIntervalMs" in k2Gossip &&
      "minInitiateIntervalMs" in k2Gossip,
  );
  assert.strictEqual(k2Gossip.initiateIntervalMs, initiateIntervalMs);
  assert.strictEqual(k2Gossip.minInitiateIntervalMs, minInitiateIntervalMs);

  await scenario.cleanUp();
});

test("Install hApp bundle and access cell by role name", async () => {
  const scenario = new Scenario();

  const alice = await scenario.addPlayerWithApp({
    appBundleSource: {
      type: "path",
      value: FIXTURE_HAPP_URL.pathname,
    },
  });
  assert.ok(alice.namedCells.get("test"));
  await scenario.cleanUp();
});

test("Add players with hApp bundles", async () => {
  const scenario = new Scenario();
  assert.ok(scenario.networkSeed);
  const [alice, bob] = await scenario.addPlayersWithApps([
    { appBundleSource: { type: "path", value: FIXTURE_HAPP_URL.pathname } },
    { appBundleSource: { type: "path", value: FIXTURE_HAPP_URL.pathname } },
  ]);
  assert.ok(alice.namedCells.get("test"));
  assert.ok(bob.namedCells.get("test"));

  await scenario.cleanUp();
});

test("Add players with the same hApp bundle", async () => {
  const scenario = new Scenario();
  assert.ok(scenario.networkSeed);
  const [alice, bob] = await scenario.addPlayersWithSameApp(
    { appBundleSource: { type: "path", value: FIXTURE_HAPP_URL.pathname } },
    2,
  );
  assert.ok(alice.namedCells.get("test"));
  assert.ok(bob.namedCells.get("test"));

  await scenario.cleanUp();
});

test("Create and read an entry, 2 conductors", async () => {
  // The wrapper takes care of creating a scenario and shutting down or deleting
  // all conductors involved in the test scenario.
  await runScenario(async (scenario) => {
    // Construct proper paths for a hApp file created by the `hc app pack` command.
    const appBundleSource: AppBundleSource = {
      type: "path",
      value: FIXTURE_HAPP_URL.pathname,
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
    // in the app manifesassert.
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
    assert.equal(readContent, content);
  });
});

test("Conductor maintains data after shutdown and restart", async () => {
  const scenario = new Scenario();
  const appBundleSource: AppBundleSource = {
    type: "path",
    value: FIXTURE_HAPP_URL.pathname,
  };
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
  assert.equal(readContent, content);

  await bob.conductor.shutDown();
  assert.throws(bob.conductor.adminWs);

  await bob.conductor.startUp();
  const [appInterfaceInfo] = await bob.conductor.adminWs().listAppInterfaces();
  const issuedBob = await bob.conductor
    .adminWs()
    .issueAppAuthenticationToken({ installed_app_id: bob.appId });
  bob.appWs = await bob.conductor.connectAppWs(
    issuedBob.token,
    appInterfaceInfo.port,
  );
  const readContentAfterRestart: typeof content = await bob.appWs.callZome({
    cell_id: bob.cells[0].cell_id,
    zome_name: TEST_ZOME_NAME,
    fn_name: "read",
    payload: createEntryHash,
  });
  assert.equal(readContentAfterRestart, content);

  await scenario.cleanUp();
});

test("Receive signals with 2 conductors", async () => {
  const scenario = new Scenario();

  let signalHandlerAlice: SignalCb | undefined;
  const signalReceivedAlice = new Promise<AppSignal>((resolve) => {
    signalHandlerAlice = (signal: Signal) => {
      assert.ok(signal.type === "app");
      resolve(signal.value);
    };
  });

  let signalHandlerBob: SignalCb | undefined;
  const signalReceivedBob = new Promise<AppSignal>((resolve) => {
    signalHandlerBob = (signal: Signal) => {
      assert.ok(signal.type === "app");
      resolve(signal.value);
    };
  });

  const appBundleSource: AppBundleSource = {
    type: "path",
    value: FIXTURE_HAPP_URL.pathname,
  };
  const [alice, bob] = await scenario.addPlayersWithApps([
    { appBundleSource },
    { appBundleSource },
  ]);
  assert.ok(signalHandlerAlice);
  assert.ok("on" in alice.appWs);
  alice.appWs.on("signal", signalHandlerAlice);
  assert.ok(signalHandlerBob);
  assert.ok("on" in bob.appWs);
  bob.appWs.on("signal", signalHandlerBob);

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
  assert.deepEqual(actualSignalAlice.payload, signalAlice);
  assert.deepEqual(actualSignalBob.payload, signalBob);

  await scenario.cleanUp();
});

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

test("runScenario - call zome by role name", async () => {
  await runScenario(async (scenario: Scenario) => {
    const alice = await scenario.addPlayerWithApp({
      appBundleSource: {
        type: "path",
        value: FIXTURE_HAPP_URL.pathname,
      },
    });

    const result = (await alice.namedCells.get("test")?.callZome({
      zome_name: "coordinator",
      fn_name: "create",
      payload: "hello",
    })) as ActionHash;

    assert.ok(result);
  });
});

test("runScenario - add players and then install apps for them", async () => {
  await runScenario(async (scenario) => {
    const players = await scenario.addPlayers(2);
    const appsWithOptions: AppWithOptions[] = [
      { appBundleSource: { type: "path", value: FIXTURE_HAPP_URL.pathname } },
      { appBundleSource: { type: "path", value: FIXTURE_HAPP_URL.pathname } },
    ];
    const [aliceApp, bobApp] = await scenario.installAppsForPlayers(
      appsWithOptions,
      players,
    );
    assert.deepEqual(aliceApp.agentPubKey, players[0].agentPubKey);
    assert.deepEqual(bobApp.agentPubKey, players[1].agentPubKey);

    const content = "test-content";
    const createEntryHash = await aliceApp.cells[0].callZome<EntryHash>({
      zome_name: TEST_ZOME_NAME,
      fn_name: "create",
      payload: content,
    });

    await dhtSync([aliceApp, bobApp], aliceApp.cells[0].cell_id[0]);

    const readContent = await bobApp.cells[0].callZome<typeof content>({
      zome_name: TEST_ZOME_NAME,
      fn_name: "read",
      payload: createEntryHash,
    });
    assert.equal(readContent, content);
  });
});

test("runScenario - add players and then install the same app for them", async () => {
  await runScenario(async (scenario) => {
    const players = await scenario.addPlayers(2);
    const [aliceApp, bobApp] = await scenario.installSameAppForPlayers(
      { appBundleSource: { type: "path", value: FIXTURE_HAPP_URL.pathname } },
      players,
    );
    assert.deepEqual(aliceApp.agentPubKey, players[0].agentPubKey);
    assert.deepEqual(bobApp.agentPubKey, players[1].agentPubKey);

    const content = "test-content";
    const createEntryHash = await aliceApp.cells[0].callZome<EntryHash>({
      zome_name: TEST_ZOME_NAME,
      fn_name: "create",
      payload: content,
    });

    await dhtSync([aliceApp, bobApp], aliceApp.cells[0].cell_id[0]);

    const readContent = await bobApp.cells[0].callZome<typeof content>({
      zome_name: TEST_ZOME_NAME,
      fn_name: "read",
      payload: createEntryHash,
    });
    assert.equal(readContent, content);
  });
});
