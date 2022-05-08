import test from "tape-promise/tape";
import {
  AppSignal,
  AppSignalCb,
  DnaSource,
  EntryHash,
} from "@holochain/client";
import { cleanAllConductors, createLocalConductor } from "../../src/local";
import { FIXTURE_DNA_URL, FIXTURE_HAPP_URL } from "../fixture";
import { pause } from "../../src/util";

test("Local Conductor - Spawn a conductor and check for admin and app ws", async (t) => {
  const conductor = await createLocalConductor();
  await conductor.attachAppInterface();
  await conductor.connectAppInterface();
  t.ok(conductor.adminWs());
  t.ok(conductor.appWs());

  await conductor.shutDown();
  await cleanAllConductors();
});

test("Local Conductor - Get app info", async (t) => {
  const conductor = await createLocalConductor();
  const [aliceHapps] = await conductor.installAgentsHapps({
    agentsDnas: [[{ path: FIXTURE_DNA_URL.pathname }]],
  });
  const appInfo = await conductor.appWs().appInfo({
    installed_app_id: aliceHapps.happId,
  });
  t.deepEqual(appInfo.status, { running: null });
  await conductor.shutDown();
  await cleanAllConductors();
});

test("Local Conductor - Install and call a hApp bundle", async (t) => {
  const conductor = await createLocalConductor();
  const installedHappBundle = await conductor.installHappBundle({
    path: FIXTURE_HAPP_URL.pathname,
  });
  t.ok(installedHappBundle.happId);

  await conductor.attachAppInterface();
  await conductor.connectAppInterface();

  const entryContent = "Bye bye, world";
  const createEntryResponse: EntryHash =
    await installedHappBundle.cells[0].callZome({
      zome_name: "crud",
      fn_name: "create",
      payload: entryContent,
    });
  t.ok(createEntryResponse);
  const readEntryResponse: typeof entryContent =
    await installedHappBundle.cells[0].callZome({
      zome_name: "crud",
      fn_name: "read",
      payload: createEntryResponse,
    });
  t.equal(readEntryResponse, entryContent);

  await conductor.shutDown();
  await cleanAllConductors();
});

test("Local Conductor - Install multiple agents and DNAs and get access to agents and cells", async (t) => {
  const conductor = await createLocalConductor();
  const [aliceHapps, bobHapps] = await conductor.installAgentsHapps({
    agentsDnas: [
      [{ path: FIXTURE_DNA_URL.pathname }, { path: FIXTURE_DNA_URL.pathname }],
      [{ path: FIXTURE_DNA_URL.pathname }, { path: FIXTURE_DNA_URL.pathname }],
    ],
  });
  aliceHapps.cells.forEach((cell) =>
    t.deepEqual(cell.cell_id[1], aliceHapps.agentPubKey)
  );
  bobHapps.cells.forEach((cell) =>
    t.deepEqual(cell.cell_id[1], bobHapps.agentPubKey)
  );

  await conductor.shutDown();
  await cleanAllConductors();
});

test("Local Conductor - Create and read an entry using the entry zome", async (t) => {
  const conductor = await createLocalConductor();
  await conductor.attachAppInterface();
  await conductor.connectAppInterface();

  const agentPubKey = await conductor.adminWs().generateAgentPubKey();
  const agentPubKeyB64 = Buffer.from(agentPubKey).toString("base64");
  t.equal(agentPubKey.length, 39);
  t.ok(agentPubKeyB64.startsWith("hCAk"));

  const appId = "entry-app";
  const dnaHash = await conductor.adminWs().registerDna({
    path: FIXTURE_DNA_URL.pathname,
  });
  const installedAppInfo = await conductor.adminWs().installApp({
    installed_app_id: appId,
    agent_key: agentPubKey,
    dnas: [{ hash: dnaHash, role_id: "entry-dna" }],
  });
  const { cell_id } = installedAppInfo.cell_data[0];
  t.ok(Buffer.from(cell_id[0]).toString("base64").startsWith("hC0k"));
  t.ok(Buffer.from(cell_id[1]).toString("base64").startsWith("hCAk"));

  const enabledAppResponse = await conductor.adminWs().enableApp({
    installed_app_id: appId,
  });
  t.deepEqual(enabledAppResponse.app.status, { running: null });
  await conductor.attachAppInterface();

  const entryContent = "test-content";
  const createEntryHash: EntryHash = await conductor.appWs().callZome({
    cap_secret: null,
    cell_id,
    zome_name: "crud",
    fn_name: "create",
    provenance: agentPubKey,
    payload: entryContent,
  });
  const createdEntryHashB64 = Buffer.from(createEntryHash).toString("base64");
  t.equal(createEntryHash.length, 39);
  t.ok(createdEntryHashB64.startsWith("hCkk"));

  const readEntryResponse: typeof entryContent = await conductor
    .appWs()
    .callZome({
      cap_secret: null,
      cell_id,
      zome_name: "crud",
      fn_name: "read",
      provenance: agentPubKey,
      payload: createEntryHash,
    });
  t.equal(readEntryResponse, entryContent);

  await conductor.shutDown();
  await cleanAllConductors();
});

test("Local Conductor - Create and read an entry using the entry zome, 2 conductors, 2 cells, 2 agents", async (t) => {
  const dnas: DnaSource[] = [{ path: FIXTURE_DNA_URL.pathname }];

  const conductor1 = await createLocalConductor();
  const conductor2 = await createLocalConductor();
  const [aliceHapps] = await conductor1.installAgentsHapps({
    agentsDnas: [dnas],
  });
  const [bobHapps] = await conductor2.installAgentsHapps({
    agentsDnas: [dnas],
  });

  const entryContent = "test-content";
  const createEntryHash = await aliceHapps.cells[0].callZome<EntryHash>({
    zome_name: "crud",
    fn_name: "create",
    payload: entryContent,
  });
  const createdEntryHashB64 = Buffer.from(createEntryHash).toString("base64");
  t.equal(createEntryHash.length, 39);
  t.ok(createdEntryHashB64.startsWith("hCkk"));

  await pause(500);

  const readEntryResponse: typeof entryContent =
    await bobHapps.cells[0].callZome({
      zome_name: "crud",
      fn_name: "read",
      payload: createEntryHash,
    });
  t.equal(readEntryResponse, entryContent);

  await conductor1.shutDown();
  await conductor2.shutDown();
  await cleanAllConductors();
});

test("Local Conductor - Receive a signal", async (t) => {
  const dnas: DnaSource[] = [{ path: FIXTURE_DNA_URL.pathname }];
  const conductor = await createLocalConductor();

  let signalHandler: AppSignalCb | undefined;
  const signalReceived = new Promise<AppSignal>((resolve) => {
    signalHandler = (signal) => {
      resolve(signal);
    };
  });

  const [aliceHapps] = await conductor.installAgentsHapps({
    agentsDnas: [dnas],
    signalHandler,
  });

  const aliceSignal = { value: "signal" };
  aliceHapps.cells[0].callZome({
    zome_name: "crud",
    fn_name: "signal_loopback",
    payload: aliceSignal,
  });
  const actualSignal = await signalReceived;
  t.deepEqual(actualSignal.data.payload, aliceSignal);

  await conductor.shutDown();
  await cleanAllConductors();
});
