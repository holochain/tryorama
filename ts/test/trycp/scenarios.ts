import test from "tape-promise/tape";
import { Buffer } from "buffer";
import {
  TRYCP_SERVER_PORT,
  TryCpServer,
  TRYCP_SERVER_HOST,
} from "../../src/trycp/trycp-server";
import { TRYCP_SUCCESS_RESPONSE } from "../../src/trycp/types";
import { HoloHash } from "@holochain/client";
import { createConductor } from "../../src/trycp/conductor";
import { FIXTURE_DNA_URL } from "../fixture";
import { addAllAgentsToAllConductors } from "../../src/trycp/util";

const LOCAL_TEST_PARTIAL_PLAYER_CONFIG = `signing_service_uri: ~
encryption_service_uri: ~
decryption_service_uri: ~
dpki: ~
network:
  transport_pool:
    - type: quic
      bind_to: kitsune-quic://0.0.0.0:0
  network_type: quic_mdns`;

test("Create and read an entry using the entry zome", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const conductor = await createConductor(
    `ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`
  );

  const relativePath = await conductor.downloadDna(FIXTURE_DNA_URL);

  await conductor.configure(LOCAL_TEST_PARTIAL_PLAYER_CONFIG);
  await conductor.startup();

  const dnaHash = await conductor.registerDna(relativePath);
  const dnaHashB64 = Buffer.from(dnaHash).toString("base64");
  t.equal(dnaHash.length, 39);
  t.ok(dnaHashB64.startsWith("hC0k"));

  const agentPubKey = await conductor.generateAgentPubKey();
  const agentPubKeyB64 = Buffer.from(agentPubKey).toString("base64");
  t.equal(agentPubKey.length, 39);
  t.ok(agentPubKeyB64.startsWith("hCAk"));

  const appId = "entry-app";
  const installedAppInfo = await conductor.installApp({
    installed_app_id: appId,
    agent_key: agentPubKey,
    dnas: [{ hash: dnaHash, role_id: "entry-dna" }],
  });
  const { cell_id } = installedAppInfo.cell_data[0];
  t.ok(Buffer.from(cell_id[0]).toString("base64").startsWith("hC0k"));
  t.ok(Buffer.from(cell_id[1]).toString("base64").startsWith("hCAk"));

  const enabledAppResponse = await conductor.enableApp(appId);
  t.deepEqual(enabledAppResponse.app.status, { running: null });

  const port = TRYCP_SERVER_PORT + 50;
  const actualPort = await conductor.attachAppInterface(port);

  const connectAppInterfaceResponse = await conductor.connectAppInterface(port);
  t.equal(connectAppInterfaceResponse, TRYCP_SUCCESS_RESPONSE);
  t.equal(actualPort, port);

  const entryContent = "test-content";
  const createEntryHash = await conductor.callZome<HoloHash>(port, {
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

  const readEntryResponse = await conductor.callZome<string>(port, {
    cap_secret: null,
    cell_id,
    zome_name: "crud",
    fn_name: "read",
    provenance: agentPubKey,
    payload: createEntryHash,
  });
  t.equal(readEntryResponse, entryContent);

  await conductor.destroy();
  await localTryCpServer.stop();
});

test("Create and read an entry using the entry zome, 1 conductor, 2 cells, 2 agents", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const conductor = await createConductor(
    `ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`
  );

  const relativePath = await conductor.downloadDna(FIXTURE_DNA_URL);
  await conductor.configure(LOCAL_TEST_PARTIAL_PLAYER_CONFIG);
  await conductor.startup();
  const dnaHash1 = await conductor.registerDna(relativePath);
  const dnaHash2 = await conductor.registerDna(relativePath);
  const dnaHash1B64 = Buffer.from(dnaHash1).toString("base64");
  const dnaHash2B64 = Buffer.from(dnaHash1).toString("base64");
  t.equal(dnaHash1.length, 39);
  t.ok(dnaHash1B64.startsWith("hC0k"));
  t.equal(dnaHash2.length, 39);
  t.ok(dnaHash2B64.startsWith("hC0k"));

  const agent1PubKey = await conductor.generateAgentPubKey();
  const agent1PubKeyB64 = Buffer.from(agent1PubKey).toString("base64");
  t.equal(agent1PubKey.length, 39);
  t.ok(agent1PubKeyB64.startsWith("hCAk"));

  const agent2PubKey = await conductor.generateAgentPubKey();
  const agent2PubKeyB64 = Buffer.from(agent1PubKey).toString("base64");
  t.equal(agent2PubKey.length, 39);
  t.ok(agent2PubKeyB64.startsWith("hCAk"));

  const appId1 = "entry-app1";
  const installedAppInfo1 = await conductor.installApp({
    installed_app_id: appId1,
    agent_key: agent1PubKey,
    dnas: [{ hash: dnaHash1, role_id: "entry-dna" }],
  });
  const cellId1 = installedAppInfo1.cell_data[0].cell_id;
  t.ok(Buffer.from(cellId1[0]).toString("base64").startsWith("hC0k"));
  t.ok(Buffer.from(cellId1[1]).toString("base64").startsWith("hCAk"));

  const appId2 = "entry-app2";
  const installedAppInfo2 = await conductor.installApp({
    installed_app_id: appId2,
    agent_key: agent2PubKey,
    dnas: [{ hash: dnaHash2, role_id: "entry-dna" }],
  });
  const cellId2 = installedAppInfo2.cell_data[0].cell_id;
  t.ok(Buffer.from(cellId2[0]).toString("base64").startsWith("hC0k"));
  t.ok(Buffer.from(cellId2[1]).toString("base64").startsWith("hCAk"));
  t.deepEqual(cellId1[0], cellId2[0]);

  const enabledAppResponse1 = await conductor.enableApp(appId1);
  t.deepEqual(enabledAppResponse1.app.status, { running: null });
  const enabledAppResponse2 = await conductor.enableApp(appId2);
  t.deepEqual(enabledAppResponse2.app.status, { running: null });

  const appApiPort = TRYCP_SERVER_PORT + 50;
  const actualPort = await conductor.attachAppInterface(appApiPort);
  t.equal(actualPort, appApiPort);

  const connectAppInterfaceResponse = await conductor.connectAppInterface(
    appApiPort
  );
  t.equal(connectAppInterfaceResponse, TRYCP_SUCCESS_RESPONSE);

  const entryContent = "test-content";
  const createEntryHash = await conductor.callZome<HoloHash>(appApiPort, {
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

  const readEntryResponse = await conductor.callZome<string>(appApiPort, {
    cap_secret: null,
    cell_id: cellId2,
    zome_name: "crud",
    fn_name: "read",
    provenance: agent2PubKey,
    payload: createEntryHash,
  });
  t.equal(readEntryResponse, entryContent);

  await conductor.destroy();
  await localTryCpServer.stop();
});

test("Create and read an entry using the entry zome, 2 conductors, 2 cells, 2 agents", async (t) => {
  const localTryCpServer = await TryCpServer.start();

  const conductor1 = await createConductor(
    `ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`
  );

  const conductor2 = await createConductor(
    `ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`
  );
  try {
    await conductor1.configure(LOCAL_TEST_PARTIAL_PLAYER_CONFIG);
    const relativePath1 = await conductor1.downloadDna(FIXTURE_DNA_URL);
    await conductor1.startup("debug");
    const dnaHash1 = await conductor1.registerDna(relativePath1);
    const dnaHash1B64 = Buffer.from(dnaHash1).toString("base64");
    t.equal(dnaHash1.length, 39);
    t.ok(dnaHash1B64.startsWith("hC0k"));

    const agent1PubKey = await conductor1.generateAgentPubKey();
    const agent1PubKeyB64 = Buffer.from(agent1PubKey).toString("base64");
    t.equal(agent1PubKey.length, 39);
    t.ok(agent1PubKeyB64.startsWith("hCAk"));

    const appId = "entry-app";
    const installedAppInfo1 = await conductor1.installApp({
      installed_app_id: appId,
      agent_key: agent1PubKey,
      dnas: [{ hash: dnaHash1, role_id: "entry-dna" }],
    });
    const cellId1 = installedAppInfo1.cell_data[0].cell_id;
    t.ok(Buffer.from(cellId1[0]).toString("base64").startsWith("hC0k"));
    t.ok(Buffer.from(cellId1[1]).toString("base64").startsWith("hCAk"));

    const enabledAppResponse1 = await conductor1.enableApp("entry-app");
    t.deepEqual(enabledAppResponse1.app.status, { running: null });

    const port1 = TRYCP_SERVER_PORT + 50;
    const actualPort1 = await conductor1.attachAppInterface(port1);
    t.equal(actualPort1, port1);

    const connectAppInterfaceResponse1 = await conductor1.connectAppInterface(
      port1
    );
    t.equal(connectAppInterfaceResponse1, TRYCP_SUCCESS_RESPONSE);

    await conductor2.configure(LOCAL_TEST_PARTIAL_PLAYER_CONFIG);
    const relativePath2 = await conductor2.downloadDna(FIXTURE_DNA_URL);
    await conductor2.startup("warn");
    const dnaHash2 = await conductor2.registerDna(relativePath2);
    const dnaHash2B64 = Buffer.from(dnaHash2).toString("base64");
    t.equal(dnaHash2.length, 39);
    t.ok(dnaHash2B64.startsWith("hC0k"));

    const agent2PubKey = await conductor2.generateAgentPubKey();
    const agent2PubKeyB64 = Buffer.from(agent2PubKey).toString("base64");
    t.equal(agent2PubKey.length, 39);
    t.ok(agent2PubKeyB64.startsWith("hCAk"));

    const installedAppInfo2 = await conductor2.installApp({
      installed_app_id: appId,
      agent_key: agent2PubKey,
      dnas: [{ hash: dnaHash2, role_id: "entry-dna" }],
    });
    const cellId2 = installedAppInfo2.cell_data[0].cell_id;
    t.ok(Buffer.from(cellId2[0]).toString("base64").startsWith("hC0k"));
    t.ok(Buffer.from(cellId2[1]).toString("base64").startsWith("hCAk"));
    t.deepEqual(cellId1[0], cellId2[0]);

    const enabledAppResponse2 = await conductor2.enableApp("entry-app");
    t.deepEqual(enabledAppResponse2.app.status, { running: null });

    const port2 = TRYCP_SERVER_PORT + 51;
    const actualPort2 = await conductor2.attachAppInterface(port2);
    t.equal(actualPort2, port2);

    const connectAppInterfaceResponse = await conductor2.connectAppInterface(
      port2
    );
    t.equal(connectAppInterfaceResponse, TRYCP_SUCCESS_RESPONSE);

    await addAllAgentsToAllConductors([conductor1, conductor2]);

    const entryContent = "test-content";
    const createEntry1Hash = await conductor1.callZome<HoloHash>(port1, {
      cap_secret: null,
      cell_id: cellId1,
      zome_name: "crud",
      fn_name: "create",
      provenance: agent1PubKey,
      payload: entryContent,
    });
    const createdEntry1HashB64 =
      Buffer.from(createEntry1Hash).toString("base64");
    t.equal(createEntry1Hash.length, 39);
    t.ok(createdEntry1HashB64.startsWith("hCkk"));

    await new Promise((resolve) => setTimeout(() => resolve(null), 100));

    const readEntryResponse = await conductor2.callZome<string>(port2, {
      cap_secret: null,
      cell_id: cellId2,
      zome_name: "crud",
      fn_name: "read",
      provenance: agent2PubKey,
      payload: createEntry1Hash,
    });
    t.equal(readEntryResponse, entryContent);
  } catch (error) {
    console.error("erereradfadsf", error);
  } finally {
    await conductor1.destroy();
    await conductor2.destroy();
    await localTryCpServer.stop();
  }
});
