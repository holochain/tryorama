import {
  AppBundleSource,
  AppSignal,
  AppSignalCb,
  authorizeSigningCredentials,
  EntryHash,
} from "@holochain/client";
import assert from "node:assert/strict";
import test from "tape-promise/tape.js";
import { runScenario, Scenario } from "../../src/local/scenario.js";
import { pause } from "../../src/util.js";
import { FIXTURE_HAPP_URL } from "../fixture/index.js";

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
    alice.conductor.appWs().on("signal", signalHandlerAlice);

    await authorizeSigningCredentials(
      alice.conductor.adminWs(),
      alice.cells[0].cell_id,
      [["coordinator", "signal_loopback"]]
    );

    const signalAlice = { value: "hello alice" };
    alice.cells[0].callZome({
      zome_name: "coordinator",
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
  const [alice, bob] = await scenario.addPlayersWithApps([
    { appBundleSource: { path: FIXTURE_HAPP_URL.pathname } },
    { appBundleSource: { path: FIXTURE_HAPP_URL.pathname } },
  ]);
  t.ok(alice.namedCells.get("test"));
  t.ok(bob.namedCells.get("test"));

  await scenario.cleanUp();
});

test("Local Scenario - Create and read an entry, 2 conductors", async (t) => {
  const scenario = new Scenario();
  t.ok(scenario.networkSeed);

  const appBundleSource: AppBundleSource = { path: FIXTURE_HAPP_URL.pathname };
  const [alice, bob] = await scenario.addPlayersWithApps([
    { appBundleSource },
    { appBundleSource },
  ]);

  await scenario.shareAllAgents();

  await alice.authorizeSigningCredentials(alice.cells[0].cell_id, [
    ["coordinator", "create"],
  ]);
  await bob.authorizeSigningCredentials(bob.cells[0].cell_id, [
    ["coordinator", "read"],
  ]);

  const content = "Hi dare";
  const createEntryHash = await alice.cells[0].callZome<EntryHash>({
    zome_name: "coordinator",
    fn_name: "create",
    payload: content,
  });

  await pause(1000);

  const readContent = await bob.cells[0].callZome<typeof content>({
    zome_name: "coordinator",
    fn_name: "read",
    payload: createEntryHash,
  });
  t.equal(readContent, content);

  await scenario.cleanUp();
});

test("Local Scenario - Conductor maintains data after shutdown and restart", async (t) => {
  const scenario = new Scenario();
  const appBundleSource: AppBundleSource = { path: FIXTURE_HAPP_URL.pathname };
  const [alice, bob] = await scenario.addPlayersWithApps([
    { appBundleSource },
    { appBundleSource },
  ]);

  await scenario.shareAllAgents();

  await alice.authorizeSigningCredentials(alice.cells[0].cell_id, [
    ["coordinator", "create"],
  ]);
  await bob.authorizeSigningCredentials(bob.cells[0].cell_id, [
    ["coordinator", "read"],
  ]);

  const content = "Before shutdown";
  const createEntryHash = await alice.cells[0].callZome<EntryHash>({
    zome_name: "coordinator",
    fn_name: "create",
    payload: content,
  });

  await pause(1000);

  const readContent = await bob.cells[0].callZome<typeof content>({
    zome_name: "coordinator",
    fn_name: "read",
    payload: createEntryHash,
  });
  t.equal(readContent, content);

  await bob.conductor.shutDown();
  t.throws(bob.conductor.adminWs);

  await bob.conductor.startUp();
  await bob.conductor.connectAppInterface();
  const readContentAfterRestart = await bob.cells[0].callZome<typeof content>({
    zome_name: "coordinator",
    fn_name: "read",
    payload: createEntryHash,
  });
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
  alice.conductor.appWs().on("signal", signalHandlerAlice);
  assert(signalHandlerBob);
  bob.conductor.appWs().on("signal", signalHandlerBob);

  await alice.authorizeSigningCredentials(alice.cells[0].cell_id, [
    ["coordinator", "signal_loopback"],
  ]);
  await bob.authorizeSigningCredentials(bob.cells[0].cell_id, [
    ["coordinator", "signal_loopback"],
  ]);

  const signalAlice = { value: "hello alice" };
  alice.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "signal_loopback",
    payload: signalAlice,
  });
  const signalBob = { value: "hello bob" };
  bob.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "signal_loopback",
    payload: signalBob,
  });

  const [actualSignalAlice, actualSignalBob] = await Promise.all([
    signalReceivedAlice,
    signalReceivedBob,
  ]);
  t.deepEqual(actualSignalAlice.data.payload, signalAlice);
  t.deepEqual(actualSignalBob.data.payload, signalBob);

  await scenario.cleanUp();
});
