import { AppSignal, DnaSource, EntryHash } from "@holochain/client";
import { Buffer } from "node:buffer";
import test from "tape-promise/tape.js";
import { URL } from "node:url";
import { addAllAgentsToAllConductors } from "../../src/common.js";
import {
  cleanAllTryCpConductors,
  createTryCpConductor,
  TryCpConductorOptions,
} from "../../src/trycp/conductor/index.js";
import {
  TryCpServer,
  TRYCP_SERVER_HOST,
  TRYCP_SERVER_PORT,
} from "../../src/trycp/trycp-server.js";
import { TRYCP_SUCCESS_RESPONSE } from "../../src/trycp/types.js";
import { pause } from "../../src/util.js";
import { FIXTURE_DNA_URL, FIXTURE_HAPP_URL } from "../fixture/index.js";

const SERVER_URL = new URL(`ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`);
const LOCAL_TEST_PARTIAL_CONFIG = `signing_service_uri: ~
encryption_service_uri: ~
decryption_service_uri: ~
dpki: ~
network:
  transport_pool:
    - type: quic
  network_type: quic_mdns`;

const createTestTryCpConductor = (options?: TryCpConductorOptions) =>
  createTryCpConductor(SERVER_URL, {
    partialConfig: LOCAL_TEST_PARTIAL_CONFIG,
    ...options,
  });

test("TryCP Conductor - Stop and restart a conductor", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const conductor = await createTestTryCpConductor({ timeout: 30000 });

  const agentPubKeyResponse = await conductor.adminWs().generateAgentPubKey();
  t.ok(agentPubKeyResponse);

  await conductor.shutDown();
  await t.rejects(conductor.adminWs().generateAgentPubKey);

  await conductor.startUp({});
  const agentPubKeyResponse2 = await conductor.adminWs().generateAgentPubKey();
  t.ok(agentPubKeyResponse2);

  await conductor.shutDown();
  await conductor.disconnectClient();
  await cleanAllTryCpConductors(SERVER_URL);
  await localTryCpServer.stop();
});

test("TryCP Conductor - Install hApp bundle and access cells with role ids", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const conductor = await createTestTryCpConductor();
  const aliceHapp = await conductor.installHappBundle({
    path: FIXTURE_HAPP_URL.pathname,
  });
  t.ok(aliceHapp.namedCells.get("test"));

  await conductor.shutDown();
  await conductor.disconnectClient();
  await cleanAllTryCpConductors(SERVER_URL);
  await localTryCpServer.stop();
});

test("TryCP Conductor - Install and call a hApp bundle", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const conductor = await createTestTryCpConductor();
  const installedHappBundle = await conductor.installHappBundle({
    path: FIXTURE_HAPP_URL.pathname,
  });
  t.ok(installedHappBundle.happId);

  await conductor.adminWs().attachAppInterface();
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
  await conductor.disconnectClient();
  await cleanAllTryCpConductors(SERVER_URL);
  await localTryCpServer.stop();
});

test("TryCP Conductor - Receive a signal", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const testSignal = { value: "signal" };

  let signalHandler;
  const signalReceived = new Promise<AppSignal>((resolve) => {
    signalHandler = (signal: AppSignal) => {
      resolve(signal);
    };
  });

  const conductor = await createTestTryCpConductor({ timeout: 30000 });
  const agentPubKey = await conductor.adminWs().generateAgentPubKey();
  const installedAppBundle = await conductor.adminWs().installAppBundle({
    agent_key: agentPubKey,
    membrane_proofs: {},
    path: FIXTURE_HAPP_URL.pathname,
  });
  await conductor.adminWs().attachAppInterface();
  await conductor.connectAppInterface(signalHandler);
  await conductor
    .adminWs()
    .enableApp({ installed_app_id: installedAppBundle.installed_app_id });

  conductor.appWs().callZome({
    cap_secret: null,
    cell_id: installedAppBundle.cell_data[0].cell_id,
    zome_name: "crud",
    fn_name: "signal_loopback",
    provenance: agentPubKey,
    payload: testSignal,
  });
  const actualSignal = await signalReceived;
  t.deepEqual(actualSignal.data.payload, testSignal);

  await conductor.shutDown();
  await conductor.disconnectClient();
  await cleanAllTryCpConductors(SERVER_URL);
  await localTryCpServer.stop();
});

test("TryCP Conductor - Create and read an entry using the entry zome", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const conductor = await createTestTryCpConductor();

  const relativePath = await conductor.downloadDna(FIXTURE_DNA_URL);
  const dnaHash = await conductor.adminWs().registerDna({ path: relativePath });
  const dnaHashB64 = Buffer.from(dnaHash).toString("base64");
  t.equal(dnaHash.length, 39);
  t.ok(dnaHashB64.startsWith("hC0k"));

  const agentPubKey = await conductor.adminWs().generateAgentPubKey();
  const agentPubKeyB64 = Buffer.from(agentPubKey).toString("base64");
  t.equal(agentPubKey.length, 39);
  t.ok(agentPubKeyB64.startsWith("hCAk"));

  const appId = "entry-app";
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

  await conductor.adminWs().attachAppInterface();
  const connectAppInterfaceResponse = await conductor.connectAppInterface();
  t.equal(connectAppInterfaceResponse, TRYCP_SUCCESS_RESPONSE);

  const entryContent = "test-content";
  const createEntryHash = await conductor.appWs().callZome<EntryHash>({
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

  const readEntryResponse = await conductor
    .appWs()
    .callZome<typeof entryContent>({
      cap_secret: null,
      cell_id,
      zome_name: "crud",
      fn_name: "read",
      provenance: agentPubKey,
      payload: createEntryHash,
    });
  t.equal(readEntryResponse, entryContent);

  const disconnectAppInterfaceResponse =
    await conductor.disconnectAppInterface();
  t.equal(disconnectAppInterfaceResponse, TRYCP_SUCCESS_RESPONSE);

  await conductor.shutDown();
  await conductor.disconnectClient();
  await cleanAllTryCpConductors(SERVER_URL);
  await localTryCpServer.stop();
});

test("TryCP Conductor - Reading a non-existent entry returns null", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const conductor = await createTestTryCpConductor();
  const dnas = [{ path: FIXTURE_DNA_URL.pathname }];
  const [alice_happs] = await conductor.installAgentsHapps({
    agentsDnas: [dnas],
  });

  await conductor.adminWs().attachAppInterface();
  await conductor.connectAppInterface();

  const actual = await alice_happs.cells[0].callZome<null>({
    zome_name: "crud",
    fn_name: "read",
    provenance: alice_happs.agentPubKey,
    payload: Buffer.from("hCkk", "base64"),
  });
  t.equal(actual, null);

  await conductor.shutDown();
  await conductor.disconnectClient();
  await cleanAllTryCpConductors(SERVER_URL);
  await localTryCpServer.stop();
});

test("TryCP Conductor - Create and read an entry using the entry zome, 1 conductor, 2 cells, 2 agents", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const conductor = await createTestTryCpConductor();

  const relativePath = await conductor.downloadDna(FIXTURE_DNA_URL);
  const dnaHash1 = await conductor
    .adminWs()
    .registerDna({ path: relativePath });
  const dnaHash2 = await conductor
    .adminWs()
    .registerDna({ path: relativePath });
  const dnaHash1B64 = Buffer.from(dnaHash1).toString("base64");
  const dnaHash2B64 = Buffer.from(dnaHash1).toString("base64");
  t.equal(dnaHash1.length, 39);
  t.ok(dnaHash1B64.startsWith("hC0k"));
  t.equal(dnaHash2.length, 39);
  t.ok(dnaHash2B64.startsWith("hC0k"));

  const agent1PubKey = await conductor.adminWs().generateAgentPubKey();
  const agent1PubKeyB64 = Buffer.from(agent1PubKey).toString("base64");
  t.equal(agent1PubKey.length, 39);
  t.ok(agent1PubKeyB64.startsWith("hCAk"));

  const agent2PubKey = await conductor.adminWs().generateAgentPubKey();
  const agent2PubKeyB64 = Buffer.from(agent1PubKey).toString("base64");
  t.equal(agent2PubKey.length, 39);
  t.ok(agent2PubKeyB64.startsWith("hCAk"));

  const appId1 = "entry-app1";
  const installedAppInfo1 = await conductor.adminWs().installApp({
    installed_app_id: appId1,
    agent_key: agent1PubKey,
    dnas: [{ hash: dnaHash1, role_id: "entry-dna" }],
  });
  const cellId1 = installedAppInfo1.cell_data[0].cell_id;
  t.ok(Buffer.from(cellId1[0]).toString("base64").startsWith("hC0k"));
  t.ok(Buffer.from(cellId1[1]).toString("base64").startsWith("hCAk"));

  const appId2 = "entry-app2";
  const installedAppInfo2 = await conductor.adminWs().installApp({
    installed_app_id: appId2,
    agent_key: agent2PubKey,
    dnas: [{ hash: dnaHash2, role_id: "entry-dna" }],
  });
  const cellId2 = installedAppInfo2.cell_data[0].cell_id;
  t.ok(Buffer.from(cellId2[0]).toString("base64").startsWith("hC0k"));
  t.ok(Buffer.from(cellId2[1]).toString("base64").startsWith("hCAk"));
  t.deepEqual(cellId1[0], cellId2[0]);

  const enabledAppResponse1 = await conductor.adminWs().enableApp({
    installed_app_id: appId1,
  });
  t.deepEqual(enabledAppResponse1.app.status, { running: null });
  const enabledAppResponse2 = await conductor.adminWs().enableApp({
    installed_app_id: appId2,
  });
  t.deepEqual(enabledAppResponse2.app.status, { running: null });

  await conductor.adminWs().attachAppInterface();
  const connectAppInterfaceResponse = await conductor.connectAppInterface();
  t.equal(connectAppInterfaceResponse, TRYCP_SUCCESS_RESPONSE);

  const entryContent = "test-content";
  const createEntryHash = await conductor.appWs().callZome<EntryHash>({
    cap_secret: null,
    cell_id: cellId1,
    zome_name: "crud",
    fn_name: "create",
    provenance: agent1PubKey,
    payload: entryContent,
  });
  const createdEntryHashB64 = Buffer.from(createEntryHash).toString("base64");
  t.equal(createEntryHash.length, 39);
  t.ok(createdEntryHashB64.startsWith("hCkk"));

  const readEntryResponse = await conductor
    .appWs()
    .callZome<typeof entryContent>({
      cap_secret: null,
      cell_id: cellId2,
      zome_name: "crud",
      fn_name: "read",
      provenance: agent2PubKey,
      payload: createEntryHash,
    });
  t.equal(readEntryResponse, entryContent);

  await conductor.shutDown();
  await conductor.disconnectClient();
  await cleanAllTryCpConductors(SERVER_URL);
  await localTryCpServer.stop();
});

test("TryCP Conductor - Create and read an entry using the entry zome, 2 conductors, 2 cells, 2 agents", async (t) => {
  const localTryCpServer = await TryCpServer.start();

  const dnas: DnaSource[] = [{ path: FIXTURE_DNA_URL.pathname }];

  const conductor1 = await createTestTryCpConductor();
  const [alice] = await conductor1.installAgentsHapps({ agentsDnas: [dnas] });
  await conductor1.adminWs().attachAppInterface();
  await conductor1.connectAppInterface();

  const conductor2 = await createTestTryCpConductor();
  const [bob] = await conductor2.installAgentsHapps({ agentsDnas: [dnas] });
  await conductor2.adminWs().attachAppInterface();
  await conductor2.connectAppInterface();

  await addAllAgentsToAllConductors([conductor1, conductor2]);

  const entryContent = "test-content";
  const createEntry1Hash = await conductor1.appWs().callZome<EntryHash>({
    cap_secret: null,
    cell_id: alice.cells[0].cell_id,
    zome_name: "crud",
    fn_name: "create",
    provenance: alice.agentPubKey,
    payload: entryContent,
  });
  const createdEntry1HashB64 = Buffer.from(createEntry1Hash).toString("base64");
  t.equal(createEntry1Hash.length, 39);
  t.ok(createdEntry1HashB64.startsWith("hCkk"));

  await pause(2000);

  const readEntryResponse = await conductor2
    .appWs()
    .callZome<typeof entryContent>({
      cap_secret: null,
      cell_id: bob.cells[0].cell_id,
      zome_name: "crud",
      fn_name: "read",
      provenance: bob.agentPubKey,
      payload: createEntry1Hash,
    });
  t.equal(readEntryResponse, entryContent);

  await conductor1.shutDown();
  await conductor1.disconnectClient();
  await conductor2.shutDown();
  await conductor2.disconnectClient();
  await cleanAllTryCpConductors(SERVER_URL);
  await localTryCpServer.stop();
});
