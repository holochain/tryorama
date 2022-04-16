import test from "tape";
import fs from "fs";
import { TryCpClient } from "../src/trycp/trycp-client";
import { TRYCP_SERVER_PORT } from "../src/trycp/trycp-server";
import { TRYCP_RESPONSE_SUCCESS } from "../src";
import { HoloHash } from "@holochain/client";
import { createConductor } from "../src/trycp/conductor";
import { FIXTURE_DNA_URL } from "./fixture";

const PORT = 9000;
const HOLO_PORT_1 = `ws://172.26.0.191:${PORT}`;
const HOLO_PORT_2 = `ws://172.26.101.242:${PORT}`;

const partialConfig = `signing_service_uri: ~
encryption_service_uri: ~
decryption_service_uri: ~
dpki: ~
network:
  bootstrap_service: https://bootstrap.holo.host
  transport_pool:
    - type: quic
      bind_to: kitsune-quic://0.0.0.0:0
  network_type: quic_bootstrap`;

test("HoloPort ping", async (t) => {
  const tryCpClient = await TryCpClient.create(HOLO_PORT_1);

  const expected = "peng";
  const actual = (await tryCpClient.ping(expected)).toString();

  await tryCpClient.close();

  t.equal(actual, expected);
});

test("Create and read an entry using the entry zome", async (t) => {
  const player = await createConductor(HOLO_PORT_1);
  await player.reset();
  await player.configure();

  const path = FIXTURE_DNA_URL.pathname;
  const dnaContent = await new Promise<Buffer>((resolve, reject) => {
    fs.readFile(path, null, (err, data) => {
      if (err) {
        reject(err);
      }
      resolve(data);
    });
  });

  const relativePath = await player.saveDna(dnaContent);

  await player.startup();
  const dnaHash = await player.registerDna(relativePath);
  const dnaHashB64 = Buffer.from(dnaHash).toString("base64");
  t.equal(dnaHash.length, 39);
  t.ok(dnaHashB64.startsWith("hC0k"));

  const agentPubKey = await player.generateAgentPubKey();
  const agentPubKeyB64 = Buffer.from(agentPubKey).toString("base64");
  t.equal(agentPubKey.length, 39);
  t.ok(agentPubKeyB64.startsWith("hCAk"));

  const appId = "test-app";
  const installedAppInfo = await player.installApp({
    installed_app_id: appId,
    agent_key: agentPubKey,
    dnas: [{ hash: dnaHash, role_id: "entry-dna" }],
  });
  const { cell_id } = installedAppInfo.cell_data[0];
  t.ok(Buffer.from(cell_id[0]).toString("base64").startsWith("hC0k"));
  t.ok(Buffer.from(cell_id[1]).toString("base64").startsWith("hCAk"));

  const enabledAppResponse = await player.enableApp(appId);
  t.deepEqual(enabledAppResponse.app.status, { running: null });

  const port = TRYCP_SERVER_PORT + 50;
  const actualPort = await player.attachAppInterface(port);
  t.equal(actualPort, port);

  const connectAppInterfaceResponse = await player.connectAppInterface(port);
  t.equal(connectAppInterfaceResponse, TRYCP_RESPONSE_SUCCESS);

  const entryContent = "test-content";
  const createEntryHash = await player.callZome<HoloHash>(port, {
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

  const readEntryResponse = await player.callZome<string>(port, {
    cap_secret: null,
    cell_id,
    zome_name: "crud",
    fn_name: "read",
    provenance: agentPubKey,
    payload: createEntryHash,
  });
  t.equal(readEntryResponse, entryContent);

  await player.destroy();
});

test.only("Create and read an entry using the entry zome, 2 conductors, 2 cells, 2 agents", async (t) => {
  const dnaContent = await new Promise<Buffer>((resolve, reject) => {
    fs.readFile(FIXTURE_DNA_URL.pathname, null, (err, data) => {
      if (err) {
        reject(err);
      }
      resolve(data);
    });
  });

  const player1 = await createConductor(HOLO_PORT_1);
  await player1.reset();
  await player1.configure(partialConfig);
  const relativePath1 = await player1.saveDna(dnaContent);
  await player1.startup();
  const dnaHash1 = await player1.registerDna(relativePath1);
  const dnaHash1B64 = Buffer.from(dnaHash1).toString("base64");
  t.equal(dnaHash1.length, 39);
  t.ok(dnaHash1B64.startsWith("hC0k"));

  const agent1PubKey = await player1.generateAgentPubKey();
  const agent1PubKeyB64 = Buffer.from(agent1PubKey).toString("base64");
  t.equal(agent1PubKey.length, 39);
  t.ok(agent1PubKeyB64.startsWith("hCAk"));

  const role_id = "entry-dna";
  const appId = "entry-app";
  const installedAppInfo1 = await player1.installApp({
    installed_app_id: appId,
    agent_key: agent1PubKey,
    dnas: [{ hash: dnaHash1, role_id }],
  });
  const cellId1 = installedAppInfo1.cell_data[0].cell_id;
  t.ok(Buffer.from(cellId1[0]).toString("base64").startsWith("hC0k"));
  t.ok(Buffer.from(cellId1[1]).toString("base64").startsWith("hCAk"));

  const enabledAppResponse1 = await player1.enableApp(appId);
  t.deepEqual(enabledAppResponse1.app.status, { running: null });

  const port1 = TRYCP_SERVER_PORT + 50;
  const actualPort1 = await player1.attachAppInterface(port1);
  t.equal(actualPort1, port1);

  const connectAppInterfaceResponse1 = await player1.connectAppInterface(port1);
  t.equal(connectAppInterfaceResponse1, TRYCP_RESPONSE_SUCCESS);

  const player2 = await createConductor(HOLO_PORT_2);
  await player2.reset();
  await player2.configure(partialConfig);
  const relativePath2 = await player2.saveDna(dnaContent);
  await player2.startup();
  const dnaHash2 = await player2.registerDna(relativePath2);
  const dnaHash2B64 = Buffer.from(dnaHash2).toString("base64");
  t.equal(dnaHash2.length, 39);
  t.ok(dnaHash2B64.startsWith("hC0k"));

  const agent2PubKey = await player2.generateAgentPubKey();
  const agent2PubKeyB64 = Buffer.from(agent2PubKey).toString("base64");
  t.equal(agent2PubKey.length, 39);
  t.ok(agent2PubKeyB64.startsWith("hCAk"));

  const installedAppInfo2 = await player2.installApp({
    installed_app_id: appId,
    agent_key: agent2PubKey,
    dnas: [{ hash: dnaHash2, role_id }],
  });
  const cellId2 = installedAppInfo2.cell_data[0].cell_id;
  t.ok(Buffer.from(cellId2[0]).toString("base64").startsWith("hC0k"));
  t.ok(Buffer.from(cellId2[1]).toString("base64").startsWith("hCAk"));
  t.deepEqual(cellId1[0], cellId2[0]);

  const enabledAppResponse2 = await player2.enableApp("entry-app");
  t.deepEqual(enabledAppResponse2.app.status, { running: null });

  const port2 = TRYCP_SERVER_PORT + 50;
  const actualPort2 = await player2.attachAppInterface(port2);
  t.equal(actualPort2, port2);

  const connectAppInterfaceResponse2 = await player2.connectAppInterface(port2);
  t.equal(connectAppInterfaceResponse2, TRYCP_RESPONSE_SUCCESS);

  const entryContent = "test-content";
  const createEntry1Hash = await player1.callZome<HoloHash>(port1, {
    cap_secret: null,
    cell_id: cellId1,
    zome_name: "crud",
    fn_name: "create",
    provenance: agent1PubKey,
    payload: entryContent,
  });
  const createdEntry1HashB64 = Buffer.from(createEntry1Hash).toString("base64");
  t.equal(createEntry1Hash.length, 39);
  t.ok(createdEntry1HashB64.startsWith("hCkk"));

  await new Promise((resolve) => setTimeout(resolve, 2000));

  const readEntryResponse = await player2.callZome<string>(port2, {
    cap_secret: null,
    cell_id: cellId2,
    zome_name: "crud",
    fn_name: "read",
    provenance: agent2PubKey,
    payload: createEntry1Hash,
  });
  t.equal(readEntryResponse, entryContent);

  await player1.destroy();
  await player2.destroy();
});
