import { AppSignal, DnaSource, EntryHash } from "@holochain/client";
import { Buffer } from "node:buffer";
import test from "tape-promise/tape.js";
import { URL } from "node:url";
import { addAllAgentsToAllConductors } from "../../src/common.js";
import {
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
import { TryCpClient } from "../../src/index.js";

const SERVER_URL = new URL(`ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`);
const LOCAL_TEST_PARTIAL_CONFIG = `signing_service_uri: ~
encryption_service_uri: ~
decryption_service_uri: ~
dpki: ~
network:
  transport_pool:
    - type: quic
  network_type: quic_mdns`;

const createTestConductor = (
  client: TryCpClient,
  options?: TryCpConductorOptions
) =>
  createTryCpConductor(client, {
    partialConfig: LOCAL_TEST_PARTIAL_CONFIG,
    ...options,
  });

test("TryCP Conductor - stop and restart a conductor", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const client = await TryCpClient.create(SERVER_URL);
  const conductor = await createTestConductor(client);

  const agentPubKeyResponse = await conductor.adminWs().generateAgentPubKey();
  t.ok(agentPubKeyResponse, "agent pub key generated before shutdown");

  await conductor.shutDown();
  await t.rejects(
    conductor.adminWs().generateAgentPubKey,
    "conductor rejects request after shutdown"
  );

  await conductor.startUp({});
  const agentPubKeyResponse2 = await conductor.adminWs().generateAgentPubKey();
  t.ok(agentPubKeyResponse2, "agent pub key generated after restart");

  await client.cleanUp();
  await localTryCpServer.stop();
});

test("TryCP Conductor - provide agent pub keys when installing hApp", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const client = await TryCpClient.create(SERVER_URL);
  const conductor = await createTestConductor(client);

  const agentPubKey = await conductor.adminWs().generateAgentPubKey();
  t.ok(agentPubKey, "agent pub key generated");

  const [alice] = await conductor.installAgentsHapps({
    agentsDnas: [{ dnas: [{ path: FIXTURE_DNA_URL.pathname }], agentPubKey }],
  });
  t.deepEqual(
    alice.agentPubKey,
    agentPubKey,
    "alice's agent pub key matches provided key"
  );

  await client.cleanUp();
  await localTryCpServer.stop();
});

test("TryCP Conductor - install hApp bundle and access cells with role ids", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const client = await TryCpClient.create(SERVER_URL);
  const conductor = await createTestConductor(client);
  const aliceHapp = await conductor.installHappBundle({
    path: FIXTURE_HAPP_URL.pathname,
  });
  t.ok(aliceHapp.namedCells.get("test"), "named cell can be accessed");

  await client.cleanUp();
  await localTryCpServer.stop();
});

test("TryCP Conductor - install and call a hApp bundle", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const client = await TryCpClient.create(SERVER_URL);
  const conductor = await createTestConductor(client);
  const installedHappBundle = await conductor.installHappBundle({
    path: FIXTURE_HAPP_URL.pathname,
  });
  t.ok(installedHappBundle.happId, "installed hApp bundle has a hApp id");

  await conductor.adminWs().attachAppInterface();
  await conductor.connectAppInterface();

  const entryContent = "Bye bye, world";
  const createEntryResponse: EntryHash =
    await installedHappBundle.cells[0].callZome({
      zome_name: "crud",
      fn_name: "create",
      payload: entryContent,
    });
  t.ok(createEntryResponse, "entry created successfully");
  const readEntryResponse: typeof entryContent =
    await installedHappBundle.cells[0].callZome({
      zome_name: "crud",
      fn_name: "read",
      payload: createEntryResponse,
    });
  t.equal(
    readEntryResponse,
    entryContent,
    "read entry content matches created entry content"
  );

  await client.cleanUp();
  await localTryCpServer.stop();
});

test("TryCP Conductor - receive a signal", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const client = await TryCpClient.create(SERVER_URL, 30000);
  const conductor = await createTestConductor(client);

  const testSignal = { value: "signal" };

  let signalHandler;
  const signalReceived = new Promise<AppSignal>((resolve) => {
    signalHandler = (signal: AppSignal) => {
      resolve(signal);
    };
  });

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
  t.deepEqual(
    actualSignal.data.payload,
    testSignal,
    "received signal matches expected signal"
  );

  await client.cleanUp();
  await localTryCpServer.stop();
});

test("TryCP Conductor - create and read an entry using the entry zome", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const client = await TryCpClient.create(SERVER_URL);
  const conductor = await createTestConductor(client);

  const relativePath = await conductor.downloadDna(FIXTURE_DNA_URL);
  const dnaHash = await conductor.adminWs().registerDna({ path: relativePath });
  const dnaHashB64 = Buffer.from(dnaHash).toString("base64");
  t.equal(dnaHash.length, 39, "DNA hash is 39 bytes long");
  t.ok(dnaHashB64.startsWith("hC0k"), "DNA hash starts with hC0k");

  const agentPubKey = await conductor.adminWs().generateAgentPubKey();
  const agentPubKeyB64 = Buffer.from(agentPubKey).toString("base64");
  t.equal(agentPubKey.length, 39, "agent pub key is 39 bytes long");
  t.ok(agentPubKeyB64.startsWith("hCAk"), "agent pub key starts with hCAk");

  const appId = "entry-app";
  const installedAppInfo = await conductor.adminWs().installApp({
    installed_app_id: appId,
    agent_key: agentPubKey,
    dnas: [{ hash: dnaHash, role_id: "entry-dna" }],
  });
  const { cell_id } = installedAppInfo.cell_data[0];
  t.ok(
    Buffer.from(cell_id[0]).toString("base64").startsWith("hC0k"),
    "first part of cell id start with hC0k"
  );
  t.ok(
    Buffer.from(cell_id[1]).toString("base64").startsWith("hCAk"),
    "second part of cell id starts with hC0k"
  );

  const enabledAppResponse = await conductor.adminWs().enableApp({
    installed_app_id: appId,
  });
  t.deepEqual(
    enabledAppResponse.app.status,
    { running: null },
    "enabled app response matches 'running'"
  );

  await conductor.adminWs().attachAppInterface();
  const connectAppInterfaceResponse = await conductor.connectAppInterface();
  t.equal(
    connectAppInterfaceResponse,
    TRYCP_SUCCESS_RESPONSE,
    "connected app interface responds with success"
  );

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
  t.equal(createEntryHash.length, 39, "created entry hash is 39 bytes long");
  t.ok(
    createdEntryHashB64.startsWith("hCkk"),
    "created entry hash starts with hCkk"
  );

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
  t.equal(
    readEntryResponse,
    entryContent,
    "read entry content matches created entry content"
  );

  const disconnectAppInterfaceResponse =
    await conductor.disconnectAppInterface();
  t.equal(
    disconnectAppInterfaceResponse,
    TRYCP_SUCCESS_RESPONSE,
    "disconnect app interface responds with success"
  );

  await client.cleanUp();
  await localTryCpServer.stop();
});

test("TryCP Conductor - reading a non-existent entry returns null", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const client = await TryCpClient.create(SERVER_URL);
  const conductor = await createTestConductor(client);
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
  t.equal(actual, null, "read a non-existing entry returns null");

  await client.cleanUp();
  await localTryCpServer.stop();
});

test("TryCP Conductor - create and read an entry using the entry zome, 1 conductor, 2 cells, 2 agents", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const client = await TryCpClient.create(SERVER_URL);
  const conductor = await createTestConductor(client);

  const relativePath = await conductor.downloadDna(FIXTURE_DNA_URL);
  const dnaHash1 = await conductor
    .adminWs()
    .registerDna({ path: relativePath });
  const dnaHash2 = await conductor
    .adminWs()
    .registerDna({ path: relativePath });
  const dnaHash1B64 = Buffer.from(dnaHash1).toString("base64");
  const dnaHash2B64 = Buffer.from(dnaHash1).toString("base64");
  t.equal(dnaHash1.length, 39, "DNA hash 1 is 39 bytes long");
  t.ok(dnaHash1B64.startsWith("hC0k"), "DNA hash 1 starts with hC0k");
  t.equal(dnaHash2.length, 39, "DNA hash 2 is 39 bytes long");
  t.ok(dnaHash2B64.startsWith("hC0k"), "DNA hash 2 starts with hC0k");

  const agent1PubKey = await conductor.adminWs().generateAgentPubKey();
  const agent1PubKeyB64 = Buffer.from(agent1PubKey).toString("base64");
  t.equal(agent1PubKey.length, 39), "agent pub key 1 is 39 bytes long";
  t.ok(agent1PubKeyB64.startsWith("hCAk"), "agent pub key 1 starts with hCAk");

  const agent2PubKey = await conductor.adminWs().generateAgentPubKey();
  const agent2PubKeyB64 = Buffer.from(agent1PubKey).toString("base64");
  t.equal(agent2PubKey.length, 39, "agent pub key 2 is 39 bytes long");
  t.ok(agent2PubKeyB64.startsWith("hCAk"), "agent pub key 2 starts with hCAk");

  const appId1 = "entry-app1";
  const installedAppInfo1 = await conductor.adminWs().installApp({
    installed_app_id: appId1,
    agent_key: agent1PubKey,
    dnas: [{ hash: dnaHash1, role_id: "entry-dna" }],
  });
  const cellId1 = installedAppInfo1.cell_data[0].cell_id;
  t.ok(
    Buffer.from(cellId1[0]).toString("base64").startsWith("hC0k"),
    "first part of cell id 1 starts with hC0k"
  );
  t.ok(
    Buffer.from(cellId1[1]).toString("base64").startsWith("hCAk"),
    "second part of cell id 1 starts with hCAk"
  );

  const appId2 = "entry-app2";
  const installedAppInfo2 = await conductor.adminWs().installApp({
    installed_app_id: appId2,
    agent_key: agent2PubKey,
    dnas: [{ hash: dnaHash2, role_id: "entry-dna" }],
  });
  const cellId2 = installedAppInfo2.cell_data[0].cell_id;
  t.ok(
    Buffer.from(cellId2[0]).toString("base64").startsWith("hC0k"),
    "first part of cell id 2 starts with hC0k"
  );
  t.ok(
    Buffer.from(cellId2[1]).toString("base64").startsWith("hCAk"),
    "second part of cell id 2 starts with hCAk"
  );
  t.deepEqual(
    cellId1[0],
    cellId2[0],
    "DNA hash of cell 1 matches DNA has of cell 2"
  );

  const enabledAppResponse1 = await conductor.adminWs().enableApp({
    installed_app_id: appId1,
  });
  t.deepEqual(
    enabledAppResponse1.app.status,
    { running: null },
    "enabled app response 1 matches 'running'"
  );
  const enabledAppResponse2 = await conductor.adminWs().enableApp({
    installed_app_id: appId2,
  });
  t.deepEqual(
    enabledAppResponse2.app.status,
    { running: null },
    "enabled app response 2 matches 'running'"
  );

  await conductor.adminWs().attachAppInterface();
  const connectAppInterfaceResponse = await conductor.connectAppInterface();
  t.equal(
    connectAppInterfaceResponse,
    TRYCP_SUCCESS_RESPONSE,
    "connect app interface responds with success"
  );

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
  t.equal(createEntryHash.length, 39, "created entry hash is 39 bytes long");
  t.ok(
    createdEntryHashB64.startsWith("hCkk"),
    "created entry hash starts with hCkk"
  );

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
  t.equal(
    readEntryResponse,
    entryContent,
    "read entry content matches created entry content"
  );

  await client.cleanUp();
  await localTryCpServer.stop();
});

test("TryCP Conductor - create and read an entry using the entry zome, 2 conductors, 2 cells, 2 agents", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const client = await TryCpClient.create(SERVER_URL);

  const dnas: DnaSource[] = [{ path: FIXTURE_DNA_URL.pathname }];

  const conductor1 = await createTestConductor(client);
  const [alice] = await conductor1.installAgentsHapps({ agentsDnas: [dnas] });
  await conductor1.adminWs().attachAppInterface();
  await conductor1.connectAppInterface();

  const conductor2 = await createTestConductor(client);
  const [bob] = await conductor2.installAgentsHapps({ agentsDnas: [dnas] });
  await conductor2.adminWs().attachAppInterface();
  await conductor2.connectAppInterface();

  await addAllAgentsToAllConductors([conductor1, conductor2]);

  const entryContent = "test-content";
  const createEntryHash = await conductor1.appWs().callZome<EntryHash>({
    cap_secret: null,
    cell_id: alice.cells[0].cell_id,
    zome_name: "crud",
    fn_name: "create",
    provenance: alice.agentPubKey,
    payload: entryContent,
  });
  const createdEntryHashB64 = Buffer.from(createEntryHash).toString("base64");
  t.equal(createEntryHash.length, 39, "create entry hash is 39 bytes long");
  t.ok(
    createdEntryHashB64.startsWith("hCkk"),
    "create entry hash starts with hCkk"
  );

  await pause(2000);

  const readEntryResponse = await conductor2
    .appWs()
    .callZome<typeof entryContent>({
      cap_secret: null,
      cell_id: bob.cells[0].cell_id,
      zome_name: "crud",
      fn_name: "read",
      provenance: bob.agentPubKey,
      payload: createEntryHash,
    });
  t.equal(
    readEntryResponse,
    entryContent,
    "read entry content matches created entry content"
  );

  await client.cleanUp();
  await localTryCpServer.stop();
});
