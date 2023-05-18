import {
  ActionHash,
  AppBundleSource,
  AppSignal,
  CellType,
  CloneId,
  EntryHash,
  GrantedFunctionsType,
} from "@holochain/client";
import assert from "node:assert";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
import test from "tape-promise/tape.js";
import { runLocalServices, stopLocalServices } from "../../src/common.js";
import { TryCpClient } from "../../src/index.js";
import { createTryCpConductor } from "../../src/trycp/conductor/index.js";
import {
  TRYCP_SERVER_HOST,
  TRYCP_SERVER_PORT,
  TryCpServer,
} from "../../src/trycp/trycp-server.js";
import { TRYCP_SUCCESS_RESPONSE } from "../../src/trycp/types.js";
import { awaitDhtSync } from "../../src/util.js";
import { FIXTURE_DNA_URL, FIXTURE_HAPP_URL } from "../fixture/index.js";

const SERVER_URL = new URL(`ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`);
const ROLE_NAME = "test";

test("TryCP Conductor - stop and restart a conductor", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const client = await TryCpClient.create(SERVER_URL);
  client.signalingServerUrl = signalingServerUrl;
  const conductor = await createTryCpConductor(client);

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

  await stopLocalServices(servicesProcess);
  await client.cleanUp();
  await localTryCpServer.stop();
});

test("TryCP Conductor - provide agent pub keys when installing hApp", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const client = await TryCpClient.create(SERVER_URL);
  client.signalingServerUrl = signalingServerUrl;
  const conductor = await createTryCpConductor(client);

  const agentPubKey = await conductor.adminWs().generateAgentPubKey();
  t.ok(agentPubKey, "agent pub key generated");

  const alice = await conductor.installApp(
    { path: FIXTURE_HAPP_URL.pathname },
    { agentPubKey }
  );
  t.deepEqual(
    alice.agentPubKey,
    agentPubKey,
    "alice's agent pub key matches provided key"
  );

  await stopLocalServices(servicesProcess);
  await client.cleanUp();
  await localTryCpServer.stop();
});

test("TryCP Conductor - install hApp bundle and access cell by role name", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const client = await TryCpClient.create(SERVER_URL);
  client.signalingServerUrl = signalingServerUrl;
  const conductor = await createTryCpConductor(client);
  const aliceHapp = await conductor.installApp({
    path: FIXTURE_HAPP_URL.pathname,
  });
  t.ok(aliceHapp.namedCells.get(ROLE_NAME), "named cell can be accessed");

  await stopLocalServices(servicesProcess);
  await client.cleanUp();
  await localTryCpServer.stop();
});

test("TryCP Conductor - install and call a hApp bundle", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const client = await TryCpClient.create(SERVER_URL);
  client.signalingServerUrl = signalingServerUrl;
  const conductor = await createTryCpConductor(client);
  const alice = await conductor.installApp({
    path: FIXTURE_HAPP_URL.pathname,
  });
  t.ok(alice.appId, "installed hApp bundle has a hApp id");

  await conductor.adminWs().attachAppInterface();
  await conductor.connectAppInterface();

  const entryContent = "Bye bye, world";
  const createEntryResponse: EntryHash = await alice.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "create",
    payload: entryContent,
  });
  t.ok(createEntryResponse, "entry created successfully");
  const readEntryResponse: typeof entryContent = await alice.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "read",
    payload: createEntryResponse,
  });
  t.equal(
    readEntryResponse,
    entryContent,
    "read entry content matches created entry content"
  );

  await stopLocalServices(servicesProcess);
  await client.cleanUp();
  await localTryCpServer.stop();
});

test("TryCP Conductor - get a DNA definition", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const client = await TryCpClient.create(SERVER_URL);
  client.signalingServerUrl = signalingServerUrl;
  const conductor = await createTryCpConductor(client);
  const relativePath = await conductor.downloadDna(FIXTURE_DNA_URL);
  const dnaHash = await conductor.adminWs().registerDna({ path: relativePath });

  const dnaDefinition = await conductor.adminWs().getDnaDefinition(dnaHash);
  t.equal(dnaDefinition.name, "crud-dna", "dna name matches name in manifest");

  await stopLocalServices(servicesProcess);
  await client.cleanUp();
  await localTryCpServer.stop();
});

test("TryCP Conductor - dump network stats", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const client = await TryCpClient.create(SERVER_URL);
  client.signalingServerUrl = signalingServerUrl;
  const conductor = await createTryCpConductor(client);

  const networkStats = await conductor.adminWs().dumpNetworkStats();
  t.ok(typeof networkStats === "string", "network stats is a string");
  t.ok(JSON.parse(networkStats), "network stats is valid JSON");

  await stopLocalServices(servicesProcess);
  await client.cleanUp();
  await localTryCpServer.stop();
});

test("TryCP Conductor - request storage info", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const client = await TryCpClient.create(SERVER_URL);
  client.signalingServerUrl = signalingServerUrl;
  const conductor = await createTryCpConductor(client);
  const agentPubKey = await conductor.adminWs().generateAgentPubKey();
  await conductor.adminWs().installApp({
    path: FIXTURE_HAPP_URL.pathname,
    agent_key: agentPubKey,
    membrane_proofs: {},
  });

  const storageInfo = await conductor.adminWs().storageInfo();
  t.ok(storageInfo.blobs[0].dna.authored_data_size > 0);
  t.ok(storageInfo.blobs[0].dna.authored_data_size_on_disk > 0);
  t.ok(storageInfo.blobs[0].dna.dht_data_size > 0);
  t.ok(storageInfo.blobs[0].dna.dht_data_size_on_disk > 0);
  t.ok(storageInfo.blobs[0].dna.cache_data_size > 0);
  t.ok(storageInfo.blobs[0].dna.cache_data_size_on_disk > 0);
  t.deepEqual(storageInfo.blobs[0].dna.used_by, ["entry-happ"]);

  await stopLocalServices(servicesProcess);
  await client.cleanUp();
  await localTryCpServer.stop();
});

test("TryCP Conductor - request network info", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const client = await TryCpClient.create(SERVER_URL);
  client.signalingServerUrl = signalingServerUrl;
  const conductor = await createTryCpConductor(client);
  const agentPubKey = await conductor.adminWs().generateAgentPubKey();
  const appInfo = await conductor.adminWs().installApp({
    path: FIXTURE_HAPP_URL.pathname,
    agent_key: agentPubKey,
    membrane_proofs: {},
  });
  await conductor
    .adminWs()
    .enableApp({ installed_app_id: appInfo.installed_app_id });
  await conductor.adminWs().attachAppInterface();
  await conductor.connectAppInterface();
  assert(CellType.Provisioned in appInfo.cell_info[ROLE_NAME][0]);
  const dnaHash =
    appInfo.cell_info[ROLE_NAME][0][CellType.Provisioned].cell_id[0];

  const networkInfo = await conductor
    .appWs()
    .networkInfo({ agent_pub_key: agentPubKey, dnas: [dnaHash] });
  t.equal(networkInfo[0].arc_size, 1.0);
  t.assert(networkInfo[0].bytes_since_last_time_queried > 0);
  t.equal(networkInfo[0].completed_rounds_since_last_time_queried, 0);
  t.equal(networkInfo[0].current_number_of_peers, 1);
  t.equal(networkInfo[0].fetch_pool_info.num_ops_to_fetch, 0);
  t.equal(networkInfo[0].fetch_pool_info.op_bytes_to_fetch, 0);
  t.equal(networkInfo[0].total_network_peers, 1);

  await stopLocalServices(servicesProcess);
  await client.cleanUp();
  await localTryCpServer.stop();
});

test("TryCP Conductor - grant a zome call capability", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const client = await TryCpClient.create(SERVER_URL);
  client.signalingServerUrl = signalingServerUrl;
  const conductor = await createTryCpConductor(client);
  const installedHappBundle = await conductor.installApp({
    path: FIXTURE_HAPP_URL.pathname,
  });
  const agentPubKey = await conductor.adminWs().generateAgentPubKey();

  const response = await conductor.adminWs().grantZomeCallCapability({
    cell_id: installedHappBundle.cells[0].cell_id,
    cap_grant: {
      tag: "",
      access: {
        Assigned: { secret: new Uint8Array(64), assignees: [agentPubKey] },
      },
      functions: { [GrantedFunctionsType.Listed]: [["crud", "create"]] },
    },
  });
  t.equal(response, undefined);

  await stopLocalServices(servicesProcess);
  await client.cleanUp();
  await localTryCpServer.stop();
});

test("TryCP Conductor - receive a signal", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const client = await TryCpClient.create(SERVER_URL);
  client.signalingServerUrl = signalingServerUrl;
  const conductor = await createTryCpConductor(client);

  const testSignal = { value: "signal" };

  let signalHandler;
  const signalReceived = new Promise<AppSignal>((resolve) => {
    signalHandler = (signal: AppSignal) => {
      resolve(signal);
    };
  });
  const agentPubKey = await conductor.adminWs().generateAgentPubKey();
  const appInfo = await conductor.adminWs().installApp({
    path: FIXTURE_HAPP_URL.pathname,
    agent_key: agentPubKey,
    membrane_proofs: {},
  });
  await conductor.adminWs().attachAppInterface();
  await conductor.connectAppInterface(signalHandler);

  await conductor
    .adminWs()
    .enableApp({ installed_app_id: appInfo.installed_app_id });

  assert(CellType.Provisioned in appInfo.cell_info[ROLE_NAME][0]);
  const cell_id = appInfo.cell_info[ROLE_NAME][0][CellType.Provisioned].cell_id;

  conductor.appWs().callZome({
    cap_secret: null,
    cell_id,
    zome_name: "coordinator",
    fn_name: "signal_loopback",
    provenance: agentPubKey,
    payload: testSignal,
  });
  const actualSignal = await signalReceived;
  t.deepEqual(
    actualSignal.payload,
    testSignal,
    "received signal matches expected signal"
  );

  await stopLocalServices(servicesProcess);
  await client.cleanUp();
  await localTryCpServer.stop();
});

test("TryCP Conductor - create and read an entry using the entry zome", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const client = await TryCpClient.create(SERVER_URL);
  client.signalingServerUrl = signalingServerUrl;
  const conductor = await createTryCpConductor(client);

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
  const appInfo = await conductor.adminWs().installApp({
    path: FIXTURE_HAPP_URL.pathname,
    membrane_proofs: {},
    installed_app_id: appId,
    agent_key: agentPubKey,
  });
  assert(CellType.Provisioned in appInfo.cell_info[ROLE_NAME][0]);
  const { cell_id } = appInfo.cell_info[ROLE_NAME][0][CellType.Provisioned];
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
    zome_name: "coordinator",
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
      zome_name: "coordinator",
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

  await stopLocalServices(servicesProcess);
  await client.cleanUp();
  await localTryCpServer.stop();
});

test("TryCP Conductor - reading a non-existent entry returns null", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const client = await TryCpClient.create(SERVER_URL);
  client.signalingServerUrl = signalingServerUrl;
  const conductor = await createTryCpConductor(client);
  const app = { path: FIXTURE_HAPP_URL.pathname };
  const alice = await conductor.installApp(app);

  await conductor.adminWs().attachAppInterface();
  await conductor.connectAppInterface();

  const actual = await alice.cells[0].callZome<null>({
    zome_name: "coordinator",
    fn_name: "read",
    provenance: alice.agentPubKey,
    payload: Buffer.from("hCkk", "base64"),
  });
  t.equal(actual, null, "read a non-existing entry returns null");

  await stopLocalServices(servicesProcess);
  await client.cleanUp();
  await localTryCpServer.stop();
});

test("TryCP Conductor - create and read an entry using the entry zome, 1 conductor, 2 cells, 2 agents", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const client = await TryCpClient.create(SERVER_URL);
  client.signalingServerUrl = signalingServerUrl;
  const conductor = await createTryCpConductor(client);

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
  const appInfo1 = await conductor.adminWs().installApp({
    path: FIXTURE_HAPP_URL.pathname,
    installed_app_id: appId1,
    agent_key: agent1PubKey,
    membrane_proofs: {},
  });
  assert(CellType.Provisioned in appInfo1.cell_info[ROLE_NAME][0]);
  const cellId1 =
    appInfo1.cell_info[ROLE_NAME][0][CellType.Provisioned].cell_id;
  t.ok(
    Buffer.from(cellId1[0]).toString("base64").startsWith("hC0k"),
    "first part of cell id 1 starts with hC0k"
  );
  t.ok(
    Buffer.from(cellId1[1]).toString("base64").startsWith("hCAk"),
    "second part of cell id 1 starts with hCAk"
  );

  const appId2 = "entry-app2";
  const appInfo2 = await conductor.adminWs().installApp({
    path: FIXTURE_HAPP_URL.pathname,
    installed_app_id: appId2,
    agent_key: agent2PubKey,
    membrane_proofs: {},
  });
  assert(CellType.Provisioned in appInfo2.cell_info[ROLE_NAME][0]);
  const cellId2 =
    appInfo2.cell_info[ROLE_NAME][0][CellType.Provisioned].cell_id;
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
    zome_name: "coordinator",
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
      zome_name: "coordinator",
      fn_name: "read",
      provenance: agent2PubKey,
      payload: createEntryHash,
    });
  t.equal(
    readEntryResponse,
    entryContent,
    "read entry content matches created entry content"
  );

  await stopLocalServices(servicesProcess);
  await client.cleanUp();
  await localTryCpServer.stop();
});

test("TryCP Conductor - clone cell management", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const client = await TryCpClient.create(SERVER_URL);
  client.signalingServerUrl = signalingServerUrl;
  const conductor = await createTryCpConductor(client);

  const agentPubKey = await conductor.adminWs().generateAgentPubKey();
  const appId = "entry-app";
  const appInfo = await conductor.adminWs().installApp({
    path: FIXTURE_HAPP_URL.pathname,
    installed_app_id: appId,
    agent_key: agentPubKey,
    membrane_proofs: {},
  });
  assert(CellType.Provisioned in appInfo.cell_info[ROLE_NAME][0]);
  const { cell_id } = appInfo.cell_info[ROLE_NAME][0][CellType.Provisioned];
  await conductor.adminWs().enableApp({ installed_app_id: appId });
  await conductor.adminWs().attachAppInterface();
  await conductor.connectAppInterface();

  const cloneCell = await conductor.appWs().createCloneCell({
    app_id: appId,
    role_name: ROLE_NAME,
    modifiers: { network_seed: "test-seed" },
  });
  t.deepEqual(
    cloneCell.clone_id,
    new CloneId(ROLE_NAME, 0).toString(),
    "clone id is 'role_name.0'"
  );
  t.deepEqual(
    cloneCell.cell_id[1],
    cell_id[1],
    "agent pub key in clone cell and base cell match"
  );

  const testContent = "test-content";
  const entryActionHash: ActionHash = await conductor.appWs().callZome({
    cell_id: cloneCell.cell_id,
    zome_name: "coordinator",
    fn_name: "create",
    payload: testContent,
    cap_secret: null,
    provenance: agentPubKey,
  });

  await conductor
    .appWs()
    .disableCloneCell({ app_id: appId, clone_cell_id: cloneCell.cell_id });
  await t.rejects(
    conductor.appWs().callZome({
      cell_id: cloneCell.cell_id,
      zome_name: "coordinator",
      fn_name: "read",
      payload: entryActionHash,
      cap_secret: null,
      provenance: agentPubKey,
    }),
    "disabled clone cell cannot be called"
  );

  const enabledCloneCell = await conductor
    .appWs()
    .enableCloneCell({ app_id: appId, clone_cell_id: cloneCell.clone_id });
  t.deepEqual(
    enabledCloneCell,
    cloneCell,
    "enabled clone cell matches created clone cell"
  );

  const readEntryResponse: typeof testContent = await conductor
    .appWs()
    .callZome({
      cell_id: cloneCell.cell_id,
      zome_name: "coordinator",
      fn_name: "read",
      payload: entryActionHash,
      cap_secret: null,
      provenance: agentPubKey,
    });
  t.equal(readEntryResponse, testContent, "enabled clone cell can be called");

  await conductor
    .appWs()
    .disableCloneCell({ app_id: appId, clone_cell_id: cloneCell.cell_id });
  await conductor
    .adminWs()
    .deleteCloneCell({ app_id: appId, clone_cell_id: cloneCell.cell_id });
  await t.rejects(
    conductor.appWs().enableCloneCell({
      app_id: appId,
      clone_cell_id: cloneCell.clone_id,
    }),
    "deleted clone cell cannot be enabled"
  );

  await stopLocalServices(servicesProcess);
  await client.cleanUp();
  await localTryCpServer.stop();
});

test.only("TryCP Conductor - create and read an entry using the entry zome, 2 conductors, 2 cells, 2 agents", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const { servicesProcess, bootstrapServerUrl, signalingServerUrl } =
    await runLocalServices();
  const client = await TryCpClient.create(SERVER_URL);
  client.bootstrapServerUrl = bootstrapServerUrl;
  client.signalingServerUrl = signalingServerUrl;

  const app: AppBundleSource = { path: FIXTURE_HAPP_URL.pathname };

  const conductor1 = await createTryCpConductor(client);
  const alice = await conductor1.installApp(app);
  await conductor1.adminWs().attachAppInterface();
  await conductor1.connectAppInterface();

  const conductor2 = await createTryCpConductor(client);
  const bob = await conductor2.installApp(app);
  await conductor2.adminWs().attachAppInterface();
  await conductor2.connectAppInterface();

  const entryContent = "test-content";
  const createEntryHash = await conductor1.appWs().callZome<EntryHash>({
    cap_secret: null,
    cell_id: alice.cells[0].cell_id,
    zome_name: "coordinator",
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

  await awaitDhtSync([conductor1, conductor2], alice.cells[0].cell_id);

  const readEntryResponse = await conductor2
    .appWs()
    .callZome<typeof entryContent>({
      cap_secret: null,
      cell_id: bob.cells[0].cell_id,
      zome_name: "coordinator",
      fn_name: "read",
      provenance: bob.agentPubKey,
      payload: createEntryHash,
    });
  t.equal(
    readEntryResponse,
    entryContent,
    "read entry content matches created entry content"
  );

  await stopLocalServices(servicesProcess);
  await client.cleanUp();
  await localTryCpServer.stop();
});

test("TryCP Conductor - pass a custom application id to happ installation", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const client = await TryCpClient.create(SERVER_URL);
  client.signalingServerUrl = signalingServerUrl;

  const conductor = await createTryCpConductor(client);
  const expectedInstalledAppId = "test-app-id";
  const [alice] = await conductor.installAgentsApps({
    agentsApps: [{ app: { path: FIXTURE_HAPP_URL.pathname } }],
    installedAppId: expectedInstalledAppId,
  });
  const actualInstalledAppId = alice.appId;
  t.equal(
    actualInstalledAppId,
    expectedInstalledAppId,
    "installed app id matches"
  );

  await stopLocalServices(servicesProcess);
  await client.cleanUp();
  await localTryCpServer.stop();
});
