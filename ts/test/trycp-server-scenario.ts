import test from "tape-promise/tape";
import { Buffer } from "buffer";
import {
  TRYCP_SERVER_PORT,
  TryCpServer,
  TRYCP_SERVER_HOST,
} from "../src/trycp/trycp-server";
import { TRYCP_RESPONSE_SUCCESS } from "../src/trycp/types";
import { HoloHash } from "@holochain/client";
import { createPlayer } from "../src/player";

test("Create and read an entry using the entry zome", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const player = await createPlayer(
    `ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`
  );

  const url =
    "file:///Users/jost/Desktop/holochain/tryorama/ts/test/e2e/fixture/entry.dna";
  const relativePath = await player.downloadDna(url);

  await player.startup("debug");
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

  await player.shutdown();
  await localTryCpServer.stop();
});

test("Create and read an entry using the entry zome, 1 conductor, 2 agents", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const player = await createPlayer(
    `ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`
  );

  const url =
    "file:///Users/jost/Desktop/holochain/tryorama/ts/test/e2e/fixture/entry.dna";
  const relativePath = await player.downloadDna(url);

  await player.startup("debug");
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

  await player.shutdown();
  await localTryCpServer.stop();
});
