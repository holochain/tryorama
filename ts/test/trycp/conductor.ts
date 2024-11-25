import {
  ActionHash,
  AppBundleSource,
  Signal,
  CellProvisioningStrategy,
  CellType,
  CloneId,
  encodeHashToBase64,
  EntryHash,
  SignalType,
  GrantedFunctionsType,
  RevokeAgentKeyResponse,
} from "@holochain/client";
import assert from "node:assert";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
import { realpathSync } from "node:fs";
import test from "tape-promise/tape.js";
import {
  enableAndGetAgentApp,
  runLocalServices,
  stopLocalServices,
} from "../../src";
import { TryCpClient, dhtSync } from "../../src";
import { TryCpPlayer, createTryCpConductor } from "../../src";
import { TRYCP_SERVER_HOST, TRYCP_SERVER_PORT, TryCpServer } from "../../src";
import { TRYCP_SUCCESS_RESPONSE } from "../../src";
import { FIXTURE_DNA_URL, FIXTURE_HAPP_URL } from "../fixture";

const SERVER_URL = new URL(`ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`);
const ROLE_NAME = "test";

// unstable-dpki
// test("TryCP Conductor - default conductor has DPKI enabled", async (t) => {
//   const localTryCpServer = await TryCpServer.start();
//   const { servicesProcess, signalingServerUrl } = await runLocalServices();
//   const client = await TryCpClient.create(SERVER_URL);
//   client.signalingServerUrl = signalingServerUrl;
//   const conductor = await createTryCpConductor(client);
//   const agent_key = await conductor.adminWs().generateAgentPubKey();
//   const appInfo = await conductor.adminWs().installApp({
//     path: FIXTURE_HAPP_URL.pathname,
//     agent_key,
//     membrane_proofs: {},
//   });
//   await conductor
//     .adminWs()
//     .enableApp({ installed_app_id: appInfo.installed_app_id });
//   const cellIds = await conductor.adminWs().listCellIds();
//   t.equal(cellIds.length, 2, "Conductor includes DPKI cell id");

//   await stopLocalServices(servicesProcess);
//   await client.cleanUp();
//   await localTryCpServer.stop();
// });

// test("TryCP Conductor - startup DPKI disabled conductor", async (t) => {
//   const localTryCpServer = await TryCpServer.start();
//   const { servicesProcess, signalingServerUrl } = await runLocalServices();
//   const client = await TryCpClient.create(SERVER_URL);
//   client.signalingServerUrl = signalingServerUrl;
//   const conductor = await createTryCpConductor(client, { noDpki: true });
//   const agent_key = await conductor.adminWs().generateAgentPubKey();
//   const appInfo = await conductor.adminWs().installApp({
//     path: FIXTURE_HAPP_URL.pathname,
//     agent_key,
//     membrane_proofs: {},
//   });
//   await conductor
//     .adminWs()
//     .enableApp({ installed_app_id: appInfo.installed_app_id });
//   const cellIds = await conductor.adminWs().listCellIds();
//   t.equal(cellIds.length, 1, "Conductor contains only the app cell");

//   await stopLocalServices(servicesProcess);
//   await client.cleanUp();
//   await localTryCpServer.stop();
// });

test("TryCP Conductor - revoke agent key", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const client = await TryCpClient.create(SERVER_URL);
  client.signalingServerUrl = signalingServerUrl;
  const conductor = await createTryCpConductor(client);
  const aliceHapp = await conductor.installApp({
    path: FIXTURE_HAPP_URL.pathname,
  });
  const adminWs = conductor.adminWs();
  const { port } = await adminWs.attachAppInterface();
  const issued = await adminWs.issueAppAuthenticationToken({
    installed_app_id: aliceHapp.installed_app_id,
  });
  await conductor.connectAppInterface(issued.token, port);
  const appWs = await conductor.connectAppWs(issued.token, port);
  const alice = await enableAndGetAgentApp(adminWs, appWs, aliceHapp);

  // Alice can create an entry before revoking her key.
  const entryContent = "test-content";
  const createEntryResponse: EntryHash = await alice.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "create",
    payload: entryContent,
  });
  t.ok(createEntryResponse, "entry created successfully");

  const response: RevokeAgentKeyResponse = await conductor
    .adminWs()
    .revokeAgentKey({ app_id: alice.appId, agent_key: alice.agentPubKey });
  t.deepEqual(response, [], "revoked key on all cells");

  // After revoking her key, Alice should no longer be able to create an entry.
  await t.rejects(
    alice.cells[0].callZome({
      zome_name: "coordinator",
      fn_name: "create",
      payload: entryContent,
    }),
    "creating an entry is not allowed any more"
  );

  await stopLocalServices(servicesProcess);
  await client.cleanUp();
  await localTryCpServer.stop();
});

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

  const aliceApp = await conductor.installApp(
    { path: FIXTURE_HAPP_URL.pathname },
    { agentPubKey }
  );
  t.deepEqual(
    aliceApp.agent_pub_key,
    agentPubKey,
    "alice's agent pub key matches provided key"
  );

  await stopLocalServices(servicesProcess);
  await client.cleanUp();
  await localTryCpServer.stop();
});

test("TryCP Conductor - get compatible cells", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const client = await TryCpClient.create(SERVER_URL);
  client.signalingServerUrl = signalingServerUrl;
  const conductor = await createTryCpConductor(client);
  const agentPubKey = await conductor.adminWs().generateAgentPubKey();
  const app = await conductor.installApp(
    { path: FIXTURE_HAPP_URL.pathname },
    { agentPubKey }
  );
  assert(CellType.Provisioned in app.cell_info[ROLE_NAME][0]);
  const cellId = app.cell_info[ROLE_NAME][0][CellType.Provisioned].cell_id;
  const dnaHash = cellId[0];
  const dnaHashB64 = encodeHashToBase64(dnaHash);

  const response = await conductor.adminWs().getCompatibleCells(dnaHashB64);
  const compatibleCells = response.values();
  const compatibleCell_1 = compatibleCells.next();
  t.deepEqual(
    compatibleCell_1.value,
    [app.installed_app_id, [cellId]],
    "compatible cells contains tuple of installed app id and cell id"
  );
  const next = compatibleCells.next();
  t.equal(next.value, undefined, "no other value in set");
  t.assert(next.done);

  await stopLocalServices(servicesProcess);
  await client.cleanUp();
  await localTryCpServer.stop();
});

test("TryCP Conductor - install app with deferred memproofs", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const client = await TryCpClient.create(SERVER_URL);
  client.signalingServerUrl = signalingServerUrl;
  const conductor = await createTryCpConductor(client);
  const adminWs = conductor.adminWs();

  const app = await conductor.installApp({
    bundle: {
      manifest: {
        manifest_version: "1",
        name: "app",
        roles: [
          {
            name: ROLE_NAME,
            provisioning: {
              strategy: CellProvisioningStrategy.Create,
              deferred: false,
            },
            dna: {
              path: realpathSync(FIXTURE_DNA_URL),
              modifiers: { network_seed: "some_seed" },
            },
          },
        ],
        membrane_proofs_deferred: true,
      },
      resources: {},
    },
  });

  const { port } = await adminWs.attachAppInterface();
  const issued = await adminWs.issueAppAuthenticationToken({
    installed_app_id: app.installed_app_id,
  });
  await conductor.connectAppInterface(issued.token, port);
  const appWs = await conductor.connectAppWs(issued.token, port);

  let appInfo = await appWs.appInfo();
  assert(appInfo);
  t.deepEqual(
    appInfo.status,
    { disabled: { reason: "never_started" } },
    "app status is never_started"
  );

  t.rejects(
    appWs.enableApp,
    "app cannot be enabled before providing memproofs"
  );

  const response = await appWs.provideMemproofs({});
  t.equal(response, undefined, "providing memproofs successful");

  appInfo = await appWs.appInfo();
  assert(appInfo);
  t.deepEqual(
    appInfo.status,
    { disabled: { reason: "not_started_after_providing_memproofs" } },
    "app status is not_started_after_providing_memproofs"
  );

  await appWs.enableApp();

  appInfo = await appWs.appInfo();
  assert(appInfo);
  t.equal(appInfo.status, "running", "app status is running");

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
  const adminWs = conductor.adminWs();
  const aliceHapp = await conductor.installApp({
    path: FIXTURE_HAPP_URL.pathname,
  });
  const { port } = await adminWs.attachAppInterface();
  const issued = await adminWs.issueAppAuthenticationToken({
    installed_app_id: aliceHapp.installed_app_id,
  });
  await conductor.connectAppInterface(issued.token, port);
  const appWs = await conductor.connectAppWs(issued.token, port);
  const alice = await enableAndGetAgentApp(adminWs, appWs, aliceHapp);
  t.ok(alice.namedCells.get(ROLE_NAME), "named cell can be accessed");

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
  const aliceHapp = await conductor.installApp({
    path: FIXTURE_HAPP_URL.pathname,
  });
  const adminWs = conductor.adminWs();
  const { port } = await adminWs.attachAppInterface();
  const issued = await adminWs.issueAppAuthenticationToken({
    installed_app_id: aliceHapp.installed_app_id,
  });
  await conductor.connectAppInterface(issued.token, port);
  const appWs = await conductor.connectAppWs(issued.token, port);
  const alice = await enableAndGetAgentApp(adminWs, appWs, aliceHapp);
  t.ok(alice.appId, "installed hApp bundle has a hApp id");

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
  const appInfo = await conductor.adminWs().installApp({
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
  t.assert(
    storageInfo.blobs.some((blob) =>
      blob.dna.used_by.includes(appInfo.installed_app_id)
    )
  );

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
    network_seed: Date.now().toString(),
    membrane_proofs: {},
  });
  await conductor
    .adminWs()
    .enableApp({ installed_app_id: appInfo.installed_app_id });
  const { port } = await conductor.adminWs().attachAppInterface();
  const issued = await conductor.adminWs().issueAppAuthenticationToken({
    installed_app_id: appInfo.installed_app_id,
  });
  await conductor.connectAppInterface(issued.token, port);
  assert(CellType.Provisioned in appInfo.cell_info[ROLE_NAME][0]);
  const dnaHash =
    appInfo.cell_info[ROLE_NAME][0][CellType.Provisioned].cell_id[0];

  const appWs = await conductor.connectAppWs(issued.token, port);
  const networkInfo = await appWs.networkInfo({
    agent_pub_key: agentPubKey,
    dnas: [dnaHash],
  });
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
  const appInfo = await conductor.installApp({
    path: FIXTURE_HAPP_URL.pathname,
  });
  await conductor
    .adminWs()
    .enableApp({ installed_app_id: appInfo.installed_app_id });
  const agentPubKey = await conductor.adminWs().generateAgentPubKey();
  assert(CellType.Provisioned in appInfo.cell_info[ROLE_NAME][0]);

  const response = await conductor.adminWs().grantZomeCallCapability({
    cell_id: appInfo.cell_info[ROLE_NAME][0][CellType.Provisioned].cell_id,
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
  const signalReceived = new Promise<Signal>((resolve) => {
    signalHandler = (signal: Signal) => {
      resolve(signal);
    };
  });
  const agentPubKey = await conductor.adminWs().generateAgentPubKey();
  const appInfo = await conductor.adminWs().installApp({
    path: FIXTURE_HAPP_URL.pathname,
    agent_key: agentPubKey,
    membrane_proofs: {},
  });
  const { port } = await conductor.adminWs().attachAppInterface();
  const issued = await conductor.adminWs().issueAppAuthenticationToken({
    installed_app_id: appInfo.installed_app_id,
  });
  await conductor.connectAppInterface(issued.token, port);
  assert(signalHandler);
  conductor.on(port, signalHandler);

  await conductor
    .adminWs()
    .enableApp({ installed_app_id: appInfo.installed_app_id });
  const appWs = await conductor.connectAppWs(issued.token, port);

  assert(CellType.Provisioned in appInfo.cell_info[ROLE_NAME][0]);
  const cell_id = appInfo.cell_info[ROLE_NAME][0][CellType.Provisioned].cell_id;

  appWs.callZome({
    cell_id,
    zome_name: "coordinator",
    fn_name: "signal_loopback",
    provenance: agentPubKey,
    payload: testSignal,
  });
  const actualSignal = await signalReceived;
  t.deepEqual(
    actualSignal[SignalType.App].payload,
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
    "running",
    "enabled app response matches 'running'"
  );

  const { port } = await conductor.adminWs().attachAppInterface();
  const issued = await conductor.adminWs().issueAppAuthenticationToken({
    installed_app_id: appId,
  });
  const connectAppInterfaceResponse = await conductor.connectAppInterface(
    issued.token,
    port
  );
  t.equal(
    connectAppInterfaceResponse,
    TRYCP_SUCCESS_RESPONSE,
    "connected app interface responds with success"
  );
  const appWs = await conductor.connectAppWs(issued.token, port);

  const entryContent = "test-content";
  const createEntryHash = await appWs.callZome<EntryHash>({
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

  const readEntryResponse = await appWs.callZome<typeof entryContent>({
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

  const disconnectAppInterfaceResponse = await conductor.disconnectAppInterface(
    port
  );
  t.equal(
    disconnectAppInterfaceResponse,
    TRYCP_SUCCESS_RESPONSE,
    "disconnect app interface responds with success"
  );

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
    "running",
    "enabled app response 1 matches 'running'"
  );
  const enabledAppResponse2 = await conductor.adminWs().enableApp({
    installed_app_id: appId2,
  });
  t.deepEqual(
    enabledAppResponse2.app.status,
    "running",
    "enabled app response 2 matches 'running'"
  );

  const { port } = await conductor.adminWs().attachAppInterface();
  const issued = await conductor.adminWs().issueAppAuthenticationToken({
    installed_app_id: appId1,
  });
  const connectAppInterfaceResponse = await conductor.connectAppInterface(
    issued.token,
    port
  );
  t.equal(
    connectAppInterfaceResponse,
    TRYCP_SUCCESS_RESPONSE,
    "connect app interface responds with success"
  );
  const appWs = await conductor.connectAppWs(issued.token, port);

  const entryContent = "test-content";
  const createEntryHash = await appWs.callZome<EntryHash>({
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

  const readEntryResponse = await appWs.callZome<typeof entryContent>({
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
  const { port } = await conductor.adminWs().attachAppInterface();
  const issued = await conductor.adminWs().issueAppAuthenticationToken({
    installed_app_id: appId,
  });
  await conductor.connectAppInterface(issued.token, port);
  const appWs = await conductor.connectAppWs(issued.token, port);

  const cloneCell = await appWs.createCloneCell({
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
  const entryActionHash: ActionHash = await appWs.callZome({
    cell_id: cloneCell.cell_id,
    zome_name: "coordinator",
    fn_name: "create",
    payload: testContent,
    provenance: agentPubKey,
  });

  await appWs.disableCloneCell({
    clone_cell_id: cloneCell.cell_id[0],
  });
  await t.rejects(
    appWs.callZome({
      cell_id: cloneCell.cell_id,
      zome_name: "coordinator",
      fn_name: "read",
      payload: entryActionHash,
      provenance: agentPubKey,
    }),
    "disabled clone cell cannot be called"
  );

  const enabledCloneCell = await appWs.enableCloneCell({
    clone_cell_id: cloneCell.clone_id,
  });
  t.deepEqual(
    enabledCloneCell,
    cloneCell,
    "enabled clone cell matches created clone cell"
  );

  const readEntryResponse: typeof testContent = await appWs.callZome({
    cell_id: cloneCell.cell_id,
    zome_name: "coordinator",
    fn_name: "read",
    payload: entryActionHash,
    provenance: agentPubKey,
  });
  t.equal(readEntryResponse, testContent, "enabled clone cell can be called");

  await appWs.disableCloneCell({
    clone_cell_id: cloneCell.cell_id[0],
  });
  await conductor
    .adminWs()
    .deleteCloneCell({ app_id: appId, clone_cell_id: cloneCell.cell_id[0] });
  await t.rejects(
    appWs.enableCloneCell({
      clone_cell_id: cloneCell.clone_id,
    }),
    "deleted clone cell cannot be enabled"
  );

  await stopLocalServices(servicesProcess);
  await client.cleanUp();
  await localTryCpServer.stop();
});

test("TryCP Conductor - create and read an entry, 2 conductors, 2 cells, 2 agents", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const { servicesProcess, bootstrapServerUrl, signalingServerUrl } =
    await runLocalServices();
  const client = await TryCpClient.create(SERVER_URL);
  client.bootstrapServerUrl = bootstrapServerUrl;
  client.signalingServerUrl = signalingServerUrl;

  const app: AppBundleSource = { path: FIXTURE_HAPP_URL.pathname };

  const conductor1 = await createTryCpConductor(client);
  const aliceApp = await conductor1.installApp(app);
  const adminWs1 = conductor1.adminWs();
  await adminWs1.enableApp({ installed_app_id: aliceApp.installed_app_id });
  const { port: port1 } = await conductor1.adminWs().attachAppInterface();
  const issued1 = await adminWs1.issueAppAuthenticationToken({
    installed_app_id: aliceApp.installed_app_id,
  });
  await conductor1.connectAppInterface(issued1.token, port1);
  const appWs1 = await conductor1.connectAppWs(issued1.token, port1);
  const aliceAgentApp = await enableAndGetAgentApp(adminWs1, appWs1, aliceApp);
  const alice: TryCpPlayer = {
    conductor: conductor1,
    appWs: appWs1,
    ...aliceAgentApp,
  };

  const conductor2 = await createTryCpConductor(client);
  const bobApp = await conductor2.installApp(app);
  const adminWs2 = conductor2.adminWs();
  await adminWs2.enableApp({ installed_app_id: bobApp.installed_app_id });
  const { port: port2 } = await conductor2.adminWs().attachAppInterface();
  const issued2 = await adminWs2.issueAppAuthenticationToken({
    installed_app_id: bobApp.installed_app_id,
  });
  await conductor2.connectAppInterface(issued2.token, port2);
  const appWs2 = await conductor2.connectAppWs(issued2.token, port2);
  const bobAgentApp = await enableAndGetAgentApp(adminWs2, appWs2, bobApp);
  const bob: TryCpPlayer = {
    conductor: conductor2,
    appWs: appWs2,
    ...bobAgentApp,
  };

  const entryContent = "test-content";
  const createEntryHash = await appWs1.callZome<EntryHash>({
    cell_id: alice.cells[0].cell_id,
    zome_name: "coordinator",
    fn_name: "create",
    provenance: aliceApp.agent_pub_key,
    payload: entryContent,
  });
  const createdEntryHashB64 = Buffer.from(createEntryHash).toString("base64");
  t.equal(createEntryHash.length, 39, "create entry hash is 39 bytes long");
  t.ok(
    createdEntryHashB64.startsWith("hCkk"),
    "create entry hash starts with hCkk"
  );

  await dhtSync([alice, bob], alice.cells[0].cell_id[0]);

  const readEntryResponse = await appWs2.callZome<typeof entryContent>({
    cell_id: bob.cells[0].cell_id,
    zome_name: "coordinator",
    fn_name: "read",
    provenance: bobApp.agent_pub_key,
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
  const [aliceApp] = await conductor.installAgentsApps({
    agentsApps: [{ app: { path: FIXTURE_HAPP_URL.pathname } }],
    installedAppId: expectedInstalledAppId,
  });
  const actualInstalledAppId = aliceApp.installed_app_id;
  t.equal(
    actualInstalledAppId,
    expectedInstalledAppId,
    "installed app id matches"
  );

  await stopLocalServices(servicesProcess);
  await client.cleanUp();
  await localTryCpServer.stop();
});
