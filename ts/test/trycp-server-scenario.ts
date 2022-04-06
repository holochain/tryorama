import test from "tape-promise/tape";
import { Buffer } from "buffer";
import {
  TRYCP_SERVER_PORT,
  TryCpServer,
  TRYCP_SERVER_HOST,
} from "../src/trycp/trycp-server";
import { TRYCP_RESPONSE_SUCCESS } from "../src/trycp/types";
import { HoloHash } from "@holochain/client";
import { createConductor } from "../src/trycp/conductor";

test("Create and read an entry using the entry zome", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const player = await createConductor(
    `ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`
  );

  const url =
    "file:///Users/jost/Desktop/holochain/tryorama/ts/test/e2e/fixture/entry.dna";
  const relativePath = await player.downloadDna(url);

  await player.configure();
  await player.startup();
  const dnaHash = await player.registerDna(relativePath);
  const dnaHashB64 = Buffer.from(dnaHash).toString("base64");
  t.equal(dnaHash.length, 39);
  t.ok(dnaHashB64.startsWith("hC0k"));

  const agentPubKey = await player.generateAgentPubKey();
  const agentPubKeyB64 = Buffer.from(agentPubKey).toString("base64");
  t.equal(agentPubKey.length, 39);
  t.ok(agentPubKeyB64.startsWith("hCAk"));

  const cell_id = await player.installApp(agentPubKey, [
    { hash: dnaHash, role_id: "entry-dna" },
  ]);
  t.ok(Buffer.from(cell_id[0]).toString("base64").startsWith("hC0k"));
  t.ok(Buffer.from(cell_id[1]).toString("base64").startsWith("hCAk"));

  const enabledAppResponse = await player.enableApp("entry-app");
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
  await localTryCpServer.stop();
});

test("Create and read an entry using the entry zome, 1 conductor, 2 agents", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const player = await createConductor(
    `ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`
  );

  const url =
    "file:///Users/jost/Desktop/holochain/tryorama/ts/test/e2e/fixture/entry.dna";
  const relativePath = await player.downloadDna(url);

  await player.configure();
  await player.startup();
  const dnaHash = await player.registerDna(relativePath);
  const dnaHashB64 = Buffer.from(dnaHash).toString("base64");
  t.equal(dnaHash.length, 39);
  t.ok(dnaHashB64.startsWith("hC0k"));

  const agent1PubKey = await player.generateAgentPubKey();
  const agent1PubKeyB64 = Buffer.from(agent1PubKey).toString("base64");
  t.equal(agent1PubKey.length, 39);
  t.ok(agent1PubKeyB64.startsWith("hCAk"));

  const agent2PubKey = await player.generateAgentPubKey();
  const agent2PubKeyB64 = Buffer.from(agent1PubKey).toString("base64");
  t.equal(agent2PubKey.length, 39);
  t.ok(agent2PubKeyB64.startsWith("hCAk"));

  const cell_id = await player.installApp(agent1PubKey, [
    { hash: dnaHash, role_id: "entry-dna" },
  ]);
  t.ok(Buffer.from(cell_id[0]).toString("base64").startsWith("hC0k"));
  t.ok(Buffer.from(cell_id[1]).toString("base64").startsWith("hCAk"));

  const enabledAppResponse = await player.enableApp("entry-app");
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
    provenance: agent1PubKey,
    payload: entryContent,
  });
  const createdEntryHashB64 = Buffer.from(createEntryHash).toString("base64");
  t.equal(createEntryHash.length, 39);
  t.ok(createdEntryHashB64.startsWith("hCkk"));

  const cap_secret = await player.callZome<Uint8Array>(port, {
    cap_secret: null,
    cell_id,
    zome_name: "crud",
    fn_name: "get_cap_secret",
    provenance: agent1PubKey,
    payload: agent2PubKey,
  });
  t.equal(cap_secret.length, 64); // cap secret is 512 bits

  const readEntryResponse = await player.callZome<string>(port, {
    cap_secret,
    cell_id,
    zome_name: "crud",
    fn_name: "read",
    provenance: agent2PubKey,
    payload: createEntryHash,
  });
  t.equal(readEntryResponse, entryContent);

  await player.destroy();
  await localTryCpServer.stop();
});

test.only("Create and read an entry using the entry zome, 2 conductors, 2 agents", async (t) => {
  const localTryCpServer = await TryCpServer.start();

  const dnaUrl =
    "file:///Users/jost/Desktop/holochain/tryorama/ts/test/e2e/fixture/entry.dna";

  const player1 = await createConductor(
    `ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`
  );
  await player1.configure();
  const relativePath1 = await player1.downloadDna(dnaUrl);
  await player1.startup();
  const dnaHash1 = await player1.registerDna(relativePath1);
  const dnaHash1B64 = Buffer.from(dnaHash1).toString("base64");
  t.equal(dnaHash1.length, 39);
  t.ok(dnaHash1B64.startsWith("hC0k"));

  const agent1PubKey = await player1.generateAgentPubKey();
  const agent1PubKeyB64 = Buffer.from(agent1PubKey).toString("base64");
  t.equal(agent1PubKey.length, 39);
  t.ok(agent1PubKeyB64.startsWith("hCAk"));

  const cellId1 = await player1.installApp(agent1PubKey, [
    { hash: dnaHash1, role_id: "entry-dna" },
  ]);
  t.ok(Buffer.from(cellId1[0]).toString("base64").startsWith("hC0k"));
  t.ok(Buffer.from(cellId1[1]).toString("base64").startsWith("hCAk"));

  const enabledAppResponse1 = await player1.enableApp("entry-app");
  t.deepEqual(enabledAppResponse1.app.status, { running: null });

  const port1 = TRYCP_SERVER_PORT + 50;
  const actualPort1 = await player1.attachAppInterface(port1);
  t.equal(actualPort1, port1);

  const connectAppInterfaceResponse1 = await player1.connectAppInterface(port1);
  t.equal(connectAppInterfaceResponse1, TRYCP_RESPONSE_SUCCESS);

  const player2 = await createConductor(
    `ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`
  );
  await player2.configure();
  const relativePath2 = await player2.downloadDna(dnaUrl);
  await player2.startup();
  const dnaHash2 = await player2.registerDna(relativePath2);
  const dnaHash2B64 = Buffer.from(dnaHash2).toString("base64");
  t.equal(dnaHash2.length, 39);
  t.ok(dnaHash2B64.startsWith("hC0k"));

  const agent2PubKey = await player2.generateAgentPubKey();
  const agent2PubKeyB64 = Buffer.from(agent2PubKey).toString("base64");
  t.equal(agent2PubKey.length, 39);
  t.ok(agent2PubKeyB64.startsWith("hCAk"));

  const cellId2 = await player2.installApp(agent2PubKey, [
    { hash: dnaHash2, role_id: "entry-dna" },
  ]);
  t.ok(Buffer.from(cellId2[0]).toString("base64").startsWith("hC0k"));
  t.ok(Buffer.from(cellId2[1]).toString("base64").startsWith("hCAk"));

  const enabledAppResponse2 = await player2.enableApp("entry-app");
  t.deepEqual(enabledAppResponse2.app.status, { running: null });

  const port2 = TRYCP_SERVER_PORT + 51;
  const actualPort2 = await player2.attachAppInterface(port2);
  t.equal(actualPort2, port2);

  const connectAppInterfaceResponse = await player2.connectAppInterface(port2);
  t.equal(connectAppInterfaceResponse, TRYCP_RESPONSE_SUCCESS);

  await player1.connectConductors([player1, player2]);

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

  const createEntry2Hash = await player2.callZome<HoloHash>(port2, {
    cap_secret: null,
    cell_id: cellId2,
    zome_name: "crud",
    fn_name: "create",
    provenance: agent2PubKey,
    payload: entryContent,
  });
  const createdEntry2HashB64 = Buffer.from(createEntry2Hash).toString("base64");
  t.equal(createEntry2Hash.length, 39);
  t.ok(createdEntry2HashB64.startsWith("hCkk"));

  const cap_secret = await player1.callZome<Uint8Array>(port1, {
    cap_secret: null,
    cell_id: cellId1,
    zome_name: "crud",
    fn_name: "get_cap_secret",
    provenance: agent1PubKey,
    payload: agent2PubKey,
  });
  t.equal(cap_secret.length, 64); // cap secret is 512 bits = 64 bytes

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
  await localTryCpServer.stop();
});
