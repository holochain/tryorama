import {
  AppSignal,
  AppSignalCb,
  DnaSource,
  EntryHash,
} from "@holochain/client";
import test from "tape-promise/tape";
import { LocalScenario, runScenario } from "../../src/local/scenario";
import { pause } from "../../src/util";
import { FIXTURE_DNA_URL, FIXTURE_HAPP_URL } from "../fixture";

test("Local Scenario - runScenario - Install hApp bundle and access cells through role ids", async (t) => {
  await runScenario(async (scenario: LocalScenario) => {
    const alice = await scenario.addPlayerWithHappBundle({
      path: FIXTURE_HAPP_URL.pathname,
    });
    t.ok(alice.namedCells.get("test"));
  });
});

test("Local Scenario - Install hApp bundle and access cells through role ids", async (t) => {
  const scenario = new LocalScenario();

  const alice = await scenario.addPlayerWithHappBundle({
    path: FIXTURE_HAPP_URL.pathname,
  });
  t.ok(alice.namedCells.get("test"));
  await scenario.cleanUp();
});

test("Local Scenario - Add players with hApp bundles", async (t) => {
  const scenario = new LocalScenario();
  const [alice, bob] = await scenario.addPlayersWithHappBundles([
    { appBundleSource: { path: FIXTURE_HAPP_URL.pathname } },
    { appBundleSource: { path: FIXTURE_HAPP_URL.pathname } },
  ]);
  t.ok(alice.namedCells.get("test"));
  t.ok(bob.namedCells.get("test"));

  await scenario.cleanUp();
});

test("Local Scenario - Create and read an entry, 2 conductors", async (t) => {
  const scenario = new LocalScenario();
  t.ok(scenario.uid);

  const alice = await scenario.addPlayerWithHapp([
    { path: FIXTURE_DNA_URL.pathname },
  ]);
  const bob = await scenario.addPlayerWithHapp([
    { path: FIXTURE_DNA_URL.pathname },
  ]);

  const content = "Hi dare";
  const createEntryHash = await alice.cells[0].callZome<EntryHash>({
    zome_name: "crud",
    fn_name: "create",
    payload: content,
  });

  await pause(2000);

  const readContent = await bob.cells[0].callZome<typeof content>({
    zome_name: "crud",
    fn_name: "read",
    payload: createEntryHash,
  });
  t.equal(readContent, content);

  await scenario.cleanUp();
});

test("Local Scenario - Conductor maintains data after shutdown and restart", async (t) => {
  const scenario = new LocalScenario();
  const [alice, bob] = await scenario.addPlayersWithHapps([
    [{ path: FIXTURE_DNA_URL.pathname }],
    [{ path: FIXTURE_DNA_URL.pathname }],
  ]);

  const content = "Before shutdown";
  const createEntryHash = await alice.cells[0].callZome<EntryHash>({
    zome_name: "crud",
    fn_name: "create",
    payload: content,
  });

  await pause(2000);

  const readContent = await bob.cells[0].callZome<typeof content>({
    zome_name: "crud",
    fn_name: "read",
    payload: createEntryHash,
  });
  t.equal(readContent, content);

  await bob.conductor.shutDown();
  t.throws(bob.conductor.adminWs);

  await bob.conductor.startUp();
  await bob.conductor.connectAppInterface();
  const readContentAfterRestart = await bob.cells[0].callZome<typeof content>({
    zome_name: "crud",
    fn_name: "read",
    payload: createEntryHash,
  });
  t.equal(readContentAfterRestart, content);

  await scenario.cleanUp();
});

test("Local Scenario - Receive signals with 2 conductors", async (t) => {
  const scenario = new LocalScenario();
  const dnas: DnaSource[] = [{ path: FIXTURE_DNA_URL.pathname }];

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

  const [alice, bob] = await scenario.addPlayersWithHapps([
    { dnas, signalHandler: signalHandlerAlice },
    { dnas, signalHandler: signalHandlerBob },
  ]);

  const signalAlice = { value: "hello alice" };
  alice.cells[0].callZome({
    zome_name: "crud",
    fn_name: "signal_loopback",
    payload: signalAlice,
  });
  const signalBob = { value: "hello bob" };
  bob.cells[0].callZome({
    zome_name: "crud",
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
